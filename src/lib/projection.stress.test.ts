import {
  createMappingConfig,
  createMappingProjectionSession,
  type JsonValue,
} from "@/lib/mapping-engine";
import {
  computeProjectionPayload,
  projectionFlatRowPreviewLimit,
  projectionPreviewRootLimit,
  projectionRenderedRowBudget,
  streamProjectionPayload,
} from "@/lib/projection";

describe("projection memory stress tests", () => {
  describe("large root count", () => {
    it("caps preview at projectionPreviewRootLimit for inputs exceeding it", () => {
      const rootCount = 5_000;
      const records = Array.from({ length: rootCount }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        value: Math.random(),
      }));
      const input = { records };
      const json = JSON.stringify(input);

      const result = computeProjectionPayload({
        config: createMappingConfig({ rootPath: "$.records[*]" }),
        customJson: json,
        rootPath: "$.records[*]",
        sampleJson: input as JsonValue,
        sourceMode: "custom",
      });

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      expect(result.previewCapped).toBe(true);
      expect(result.previewRootLimit).toBe(projectionPreviewRootLimit);
      expect(result.conversionResult!.records.length).toBeLessThanOrEqual(
        projectionFlatRowPreviewLimit,
      );
    });

    it("handles 10k simple roots within streaming path without error", () => {
      const rootCount = 10_000;
      const records = Array.from({ length: rootCount }, (_, i) => ({
        id: i,
        email: `user${i}@test.com`,
      }));
      const json = JSON.stringify({ data: records });

      const progressEvents: number[] = [];
      const result = streamProjectionPayload(
        {
          config: createMappingConfig({ rootPath: "$.data[*]" }),
          customJson: json,
          rootPath: "$.data[*]",
          sampleJson: { data: records } as JsonValue,
          sourceMode: "custom",
        },
        {
          onProgress: (progress) => {
            progressEvents.push(progress.percent);
          },
        },
      );

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      expect(result.previewCapped).toBe(true);
      expect(result.conversionResult!.records.length).toBeLessThanOrEqual(
        projectionFlatRowPreviewLimit,
      );
      expect(progressEvents.length).toBeGreaterThan(0);
    });
  });

  describe("row explosion (cross-product)", () => {
    it("enforces rendered row budget on cross-product expansion", () => {
      // Each root has nested arrays that cause cross-product explosion:
      // 5 items x 5 sub-items = 25 rows per root.
      // With 500 roots, uncapped would be 12,500 rows.
      const rootCount = 500;
      const records = Array.from({ length: rootCount }, (_, i) => ({
        id: i,
        items: Array.from({ length: 5 }, (_, j) => ({
          sku: `SKU-${i}-${j}`,
          variants: Array.from({ length: 5 }, (_, k) => ({
            color: `color-${k}`,
            price: (j + 1) * (k + 1),
          })),
        })),
      }));
      const json = JSON.stringify({ orders: records });

      const result = computeProjectionPayload({
        config: createMappingConfig({
          flattenMode: "cross_product",
          rootPath: "$.orders[*]",
        }),
        customJson: json,
        rootPath: "$.orders[*]",
        sampleJson: { orders: records } as JsonValue,
        sourceMode: "custom",
      });

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      expect(result.conversionResult!.records.length).toBeLessThanOrEqual(
        projectionFlatRowPreviewLimit,
      );
      // Row count should be capped by the rendered row budget
      expect(result.conversionResult!.rowCount).toBeLessThanOrEqual(projectionRenderedRowBudget);
    });

    it("dynamic root limit reduces for high-expansion roots in streaming path", () => {
      // Each root produces ~25 rows via cross-product.
      // Dynamic budget should kick in after 10 roots and reduce the limit.
      const rootCount = 2_000;
      const records = Array.from({ length: rootCount }, (_, i) => ({
        id: i,
        tags: ["a", "b", "c", "d", "e"],
        categories: ["x", "y", "z", "w", "q"],
      }));
      const json = JSON.stringify({ items: records });

      const streamPreviews: Array<{ processedRoots: number; rowCount: number }> = [];
      const result = streamProjectionPayload(
        {
          config: createMappingConfig({
            flattenMode: "cross_product",
            rootPath: "$.items[*]",
          }),
          customJson: json,
          rootPath: "$.items[*]",
          sampleJson: { items: records } as JsonValue,
          sourceMode: "custom",
        },
        {
          onFlatStreamPreview: (preview) => {
            streamPreviews.push({
              processedRoots: preview.processedRoots,
              rowCount: preview.rowCount,
            });
          },
        },
      );

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      // With dynamic budgeting, the effective root limit should be reduced
      // below the default 1500 due to high rows-per-root ratio
      expect(result.previewCapped).toBe(true);
      expect(result.conversionResult!.rowCount).toBeLessThanOrEqual(projectionRenderedRowBudget);
    });
  });

  describe("wide/deep objects", () => {
    it("handles objects with many keys without excessive memory in path inspection", () => {
      // 50 unique keys per root, 200 roots
      const rootCount = 200;
      const records = Array.from({ length: rootCount }, (_, i) => {
        const record: Record<string, unknown> = { id: i };
        for (let k = 0; k < 50; k++) {
          record[`field_${k}`] = `value-${i}-${k}`;
        }
        return record;
      });
      const json = JSON.stringify({ data: records });

      const result = computeProjectionPayload({
        config: createMappingConfig({ rootPath: "$.data[*]" }),
        customJson: json,
        rootPath: "$.data[*]",
        sampleJson: { data: records } as JsonValue,
        sourceMode: "custom",
      });

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      expect(result.discoveredPaths.length).toBe(51); // id + 50 fields
      expect(result.conversionResult!.headers.length).toBe(51);
      expect(result.conversionResult!.records.length).toBeLessThanOrEqual(
        projectionFlatRowPreviewLimit,
      );
    });

    it("handles deeply nested objects (10 levels) within depth limits", () => {
      function buildDeepObject(depth: number, value: number): unknown {
        if (depth === 0) return { leaf: value };
        return { [`level_${depth}`]: buildDeepObject(depth - 1, value) };
      }

      const rootCount = 100;
      const records = Array.from({ length: rootCount }, (_, i) => buildDeepObject(10, i));
      const json = JSON.stringify({ deep: records });

      const result = computeProjectionPayload({
        config: createMappingConfig({ rootPath: "$.deep[*]", maxDepth: 12 }),
        customJson: json,
        rootPath: "$.deep[*]",
        sampleJson: { deep: records } as JsonValue,
        sourceMode: "custom",
      });

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      expect(result.discoveredPaths.length).toBeGreaterThan(0);
      expect(result.conversionResult!.records.length).toBeLessThanOrEqual(
        projectionFlatRowPreviewLimit,
      );
    });
  });

  describe("session row budget enforcement", () => {
    it("stops accumulating rows once budget is exhausted", () => {
      const session = createMappingProjectionSession(
        { flattenMode: "cross_product", rootPath: "$" },
        { renderedRowBudget: 50 },
      );

      // Each root with 2 arrays of 5 elements = 25 rows cross-product
      for (let i = 0; i < 100; i++) {
        session.appendRoot({
          id: i,
          a: [1, 2, 3, 4, 5],
          b: ["x", "y", "z", "w", "v"],
        });
      }

      // Should have processed all 100 roots
      expect(session.getProcessedRoots()).toBe(100);
      // But rows should be capped near the budget (first 2 roots = 50 rows, then stop)
      expect(session.getRenderedRowCount()).toBeLessThanOrEqual(75); // some slack for first root exceeding
      expect(session.isRowBudgetExhausted()).toBe(true);
    });

    it("does not trigger budget for small inputs", () => {
      const session = createMappingProjectionSession(
        { flattenMode: "parallel", rootPath: "$" },
        { renderedRowBudget: 5_000 },
      );

      for (let i = 0; i < 10; i++) {
        session.appendRoot({ id: i, name: `item-${i}` });
      }

      expect(session.getProcessedRoots()).toBe(10);
      expect(session.getRenderedRowCount()).toBe(10);
      expect(session.isRowBudgetExhausted()).toBe(false);
    });
  });

  describe("combined stress: large + complex", () => {
    it("processes 3k roots with nested arrays under memory constraints", () => {
      const rootCount = 3_000;
      const records = Array.from({ length: rootCount }, (_, i) => ({
        id: `record-${i}`,
        tags: [`tag-${i % 5}`, `tag-${(i + 1) % 5}`],
        metadata: {
          source: i % 2 === 0 ? "api" : "manual",
          timestamp: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
          nested: {
            priority: i % 3,
            labels: [`label-${i % 10}`],
          },
        },
      }));
      const json = JSON.stringify({ records });

      const result = streamProjectionPayload(
        {
          config: createMappingConfig({
            flattenMode: "parallel",
            rootPath: "$.records[*]",
          }),
          customJson: json,
          rootPath: "$.records[*]",
          sampleJson: { records } as JsonValue,
          sourceMode: "custom",
        },
        {},
      );

      expect(result.parseError).toBeNull();
      expect(result.conversionResult).not.toBeNull();
      expect(result.previewCapped).toBe(true);
      expect(result.conversionResult!.records.length).toBeLessThanOrEqual(
        projectionFlatRowPreviewLimit,
      );
      expect(result.discoveredPaths.length).toBeGreaterThan(0);
      expect(result.discoveredPaths.some((p) => p.path === "metadata.nested.priority")).toBe(true);
    });
  });
});
