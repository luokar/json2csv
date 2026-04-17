import { createMappingConfig } from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import {
  computeProjectionPayload,
  projectionFlatCsvPreviewCharacterLimit,
  projectionFlatRowPreviewLimit,
  projectionPreviewRootLimit,
  streamProjectionPayload,
} from "@/lib/projection";

describe("projection pipeline", () => {
  const donutSample = mappingSamples.find((sample) => sample.id === "donuts");

  if (!donutSample) {
    throw new Error("Missing donut sample");
  }

  it("projects sample input without parsing custom JSON", () => {
    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: "parallel",
        rootPath: "$.items.item[*]",
      }),
      customJson: "",
      rootPath: "$.items.item[*]",
      sampleJson: donutSample.json,
      sourceMode: "sample",
    });

    expect(result.parseError).toBeNull();
    expect(result.conversionResult?.rowCount).toBe(10);
    expect(result.discoveredPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "topping" }),
        expect.objectContaining({ path: "batters.batter.type" }),
      ]),
    );
  });

  it("returns a parse error and no conversion for invalid custom JSON", () => {
    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: "stringify",
        rootPath: "$.records[*]",
      }),
      customJson: '{"records": [',
      rootPath: "$.records[*]",
      sampleJson: donutSample.json,
      sourceMode: "custom",
    });

    expect(result.parseError).toMatch(/invalid json input at character/i);
    expect(result.conversionResult).toBeNull();
    expect(result.discoveredPaths).toEqual([]);
  });

  it("returns a parse error for empty custom JSON input", () => {
    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: "parallel",
        rootPath: "$",
      }),
      customJson: "   ",
      rootPath: "$",
      sampleJson: donutSample.json,
      sourceMode: "custom",
    });

    expect(result.parseError).toBe("Paste JSON or upload a .json file.");
    expect(result.conversionResult).toBeNull();
    expect(result.discoveredPaths).toEqual([]);
  });

  it("projects null custom JSON at the root path as a single scalar row", () => {
    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: "parallel",
        rootPath: "$",
      }),
      customJson: "null",
      rootPath: "$",
      sampleJson: donutSample.json,
      sourceMode: "custom",
    });

    expect(result.parseError).toBeNull();
    expect(result.conversionResult?.headers).toEqual(["column0"]);
    expect(result.conversionResult?.records).toEqual([{ column0: "" }]);
    expect(result.conversionResult?.rowCount).toBe(1);
  });

  it("caps live preview payloads to preview-sized flat slices", () => {
    const customJson = JSON.stringify(
      {
        records: Array.from({ length: projectionFlatRowPreviewLimit + 25 }, (_, index) => ({
          id: String(index + 1),
          note: `row-${index + 1}-${"x".repeat(320)}`,
          status: index % 2 === 0,
        })),
      },
      null,
      2,
    );

    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: "parallel",
        rootPath: "$.records[*]",
      }),
      customJson,
      rootPath: "$.records[*]",
      sampleJson: donutSample.json,
      sourceMode: "custom",
    });

    expect(result.parseError).toBeNull();
    expect(result.conversionResult?.rowCount).toBe(projectionFlatRowPreviewLimit + 25);
    expect(result.conversionResult?.records).toHaveLength(projectionFlatRowPreviewLimit);
    expect(result.conversionResult?.csvPreview.truncated).toBe(true);
    expect(result.conversionResult?.csvPreview.text).toContain("[Preview truncated]");
    expect(result.conversionResult?.csvPreview.omittedCharacters).toBeGreaterThan(0);
    expect(result.conversionResult?.csvPreview.text.length).toBeLessThanOrEqual(
      projectionFlatCsvPreviewCharacterLimit + "[Preview truncated]".length + 2,
    );
  });

  it("caps large live previews to a fixed root budget to control memory", () => {
    const customJson = JSON.stringify({
      records: Array.from({ length: projectionPreviewRootLimit + 200 }, (_, index) => ({
        id: String(index + 1),
        value: `row-${index + 1}`,
      })),
    });

    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: "parallel",
        rootPath: "$.records[*]",
      }),
      customJson,
      rootPath: "$.records[*]",
      sampleJson: donutSample.json,
      sourceMode: "custom",
    });

    expect(result.parseError).toBeNull();
    expect(result.previewCapped).toBe(true);
    expect(result.previewRootLimit).toBe(projectionPreviewRootLimit);
    expect(result.conversionResult?.rowCount).toBe(projectionPreviewRootLimit);
    expect(result.conversionResult?.records).toHaveLength(projectionFlatRowPreviewLimit);
    expect(result.discoveredPaths).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "id" })]),
    );
  });

  it("incrementally parses custom selector paths before finalizing projection", () => {
    const customJson = JSON.stringify(
      {
        meta: {
          version: 1,
        },
        records: [
          {
            active: true,
            email: "one@example.com",
            id: "1",
          },
          {
            active: false,
            email: "two@example.com",
            id: "2",
          },
        ],
      },
      null,
      2,
    );
    const progressEvents: Array<{
      label: string;
      percent: number;
      phase: string;
      phaseCompleted: number;
      phaseTotal: number;
    }> = [];
    const streamPreviews: Array<{
      headers: string[];
      previewRecords: Array<Record<string, string>>;
      processedRoots: number;
      rowCount: number;
      totalRoots: number | null;
    }> = [];

    const result = streamProjectionPayload(
      {
        config: createMappingConfig({
          flattenMode: "parallel",
          rootPath: "$.records[*]",
        }),
        customJson,
        rootPath: "$.records[*]",
        sampleJson: donutSample.json,
        sourceMode: "custom",
      },
      {
        onFlatStreamPreview: (preview) => {
          streamPreviews.push(preview);
        },
        onProgress: (progress) => {
          progressEvents.push(progress);
        },
      },
    );

    expect(streamPreviews[0]).toEqual(
      expect.objectContaining({
        headers: expect.arrayContaining(["id", "email", "active"]),
        processedRoots: 1,
        rowCount: 1,
        totalRoots: null,
      }),
    );
    expect(streamPreviews.at(-1)).toEqual(
      expect.objectContaining({
        processedRoots: 2,
        rowCount: 2,
        totalRoots: 2,
      }),
    );
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Reading JSON",
          phase: "parse",
          phaseTotal: customJson.length,
        }),
      ]),
    );
    expect(result.parseError).toBeNull();
    expect(result.conversionResult?.rowCount).toBe(2);
    expect(result.conversionResult?.records[0]).toEqual(
      expect.objectContaining({
        active: "TRUE",
        email: "one@example.com",
        id: "1",
      }),
    );
    expect(result.discoveredPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "active" }),
        expect.objectContaining({ path: "email" }),
      ]),
    );
  });

  it("incrementally parses nested wildcard selectors before finalizing projection", () => {
    const customJson = JSON.stringify(
      {
        groups: [
          {
            records: [
              {
                email: "one@example.com",
                id: "1",
              },
              {
                email: "two@example.com",
                id: "2",
              },
            ],
          },
          {
            records: [
              {
                email: "three@example.com",
                id: "3",
                tier: "vip",
              },
            ],
          },
        ],
      },
      null,
      2,
    );
    const streamPreviews: Array<{
      headers: string[];
      previewRecords: Array<Record<string, string>>;
      processedRoots: number;
      rowCount: number;
      totalRoots: number | null;
    }> = [];

    const result = streamProjectionPayload(
      {
        config: createMappingConfig({
          flattenMode: "parallel",
          rootPath: "$.groups[*].records[*]",
        }),
        customJson,
        rootPath: "$.groups[*].records[*]",
        sampleJson: donutSample.json,
        sourceMode: "custom",
      },
      {
        onFlatStreamPreview: (preview) => {
          streamPreviews.push(preview);
        },
      },
    );

    expect(streamPreviews[0]).toEqual(
      expect.objectContaining({
        headers: expect.arrayContaining(["id", "email"]),
        processedRoots: 1,
        rowCount: 1,
        totalRoots: null,
      }),
    );
    expect(streamPreviews.at(-1)).toEqual(
      expect.objectContaining({
        processedRoots: 3,
        rowCount: 3,
        totalRoots: 3,
      }),
    );
    expect(result.parseError).toBeNull();
    expect(result.conversionResult?.rowCount).toBe(3);
    expect(result.conversionResult?.records.at(-1)).toEqual(
      expect.objectContaining({
        email: "three@example.com",
        id: "3",
        tier: "vip",
      }),
    );
    expect(result.discoveredPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "email" }),
        expect.objectContaining({ path: "tier" }),
      ]),
    );
  });

  it("reports staged progress across parse, inspect, and flat passes", () => {
    const progressEvents: Array<{
      label: string;
      percent: number;
      phase: string;
      phaseCompleted: number;
      phaseTotal: number;
    }> = [];

    computeProjectionPayload(
      {
        config: createMappingConfig({
          flattenMode: "parallel",
          rootPath: "$.items.item[*]",
        }),
        customJson: "",
        rootPath: "$.items.item[*]",
        sampleJson: donutSample.json,
        sourceMode: "sample",
      },
      (progress) => {
        progressEvents.push(progress);
      },
    );

    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        label: "Reading JSON",
        percent: 0,
        phase: "parse",
      }),
    );
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scanning data structure",
          phase: "inspect",
          phaseCompleted: 2,
          phaseTotal: 2,
          percent: 25,
        }),
      ]),
    );
    expect(
      progressEvents.some(
        (progress) =>
          progress.phase === "flat" &&
          progress.phaseCompleted === 1 &&
          progress.phaseTotal === 2 &&
          progress.percent > 25 &&
          progress.percent < 100,
      ),
    ).toBe(true);
    expect(progressEvents.at(-1)).toEqual(
      expect.objectContaining({
        label: "Building spreadsheet rows",
        percent: 100,
        phase: "flat",
      }),
    );
  });

  it("emits incremental flat preview snapshots before the final payload is ready", () => {
    const streamPreviews: Array<{
      headers: string[];
      previewRecords: Array<Record<string, string>>;
      processedRoots: number;
      rowCount: number;
      totalRoots: number | null;
    }> = [];

    const result = streamProjectionPayload(
      {
        config: createMappingConfig({
          flattenMode: "parallel",
          rootPath: "$.items.item[*]",
        }),
        customJson: "",
        rootPath: "$.items.item[*]",
        sampleJson: donutSample.json,
        sourceMode: "sample",
      },
      {
        onFlatStreamPreview: (preview) => {
          streamPreviews.push(preview);
        },
      },
    );

    expect(streamPreviews).toHaveLength(2);
    expect(streamPreviews[0]).toEqual(
      expect.objectContaining({
        headers: expect.arrayContaining(["id", "name", "ppu"]),
        processedRoots: 1,
        rowCount: 7,
        totalRoots: 2,
      }),
    );
    expect(streamPreviews[0]?.previewRecords[0]).toEqual(
      expect.objectContaining({
        id: "0001",
        name: "Cake",
      }),
    );
    expect(streamPreviews.at(-1)).toEqual(
      expect.objectContaining({
        processedRoots: 2,
        rowCount: 10,
        totalRoots: 2,
      }),
    );
    expect(result.conversionResult?.rowCount).toBe(10);
  });
});
