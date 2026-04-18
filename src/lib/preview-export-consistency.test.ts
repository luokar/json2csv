import {
  convertJsonToCsvTable,
  convertJsonToCsvText,
  convertJsonToCsvPreviewTable,
  createMappingConfig,
} from "@/lib/mapping-engine";
import {
  computeProjectionPayload,
  projectionSmallInputRootThreshold,
} from "@/lib/projection";
import { mappingSamples } from "@/lib/mapping-samples";

const defaultRootPaths: Record<string, string> = {
  collisions: "$.rows[*]",
  donuts: "$.items.item[*]",
  heterogeneous: "$.records[*]",
};

describe("preview-export consistency", () => {
  for (const sample of mappingSamples) {
    const rootPath = defaultRootPaths[sample.id] ?? "$";

    it(`${sample.id} (${sample.title}): projection pipeline matches export exactly`, () => {
      const config = createMappingConfig({ rootPath });

      // Export path — the ground truth
      const exportResult = convertJsonToCsvTable(sample.json, { rootPath });
      const exportCsvResult = convertJsonToCsvText(sample.json, { rootPath });

      // Full projection pipeline (small-input relaxed limits should kick in)
      const projectionResult = computeProjectionPayload({
        config,
        customJson: "",
        rootPath,
        sampleJson: sample.json,
        sourceMode: "sample",
      });

      // Headers must match exactly
      expect(projectionResult.conversionResult?.headers).toEqual(exportResult.headers);

      // For small inputs, ALL records must match (not just a subset)
      expect(projectionResult.conversionResult?.records).toEqual(exportResult.records);

      // Row count must match
      expect(projectionResult.conversionResult?.rowCount).toEqual(exportResult.records.length);

      // CSV text must match when not truncated
      const projectionCsv = projectionResult.conversionResult?.csvPreview.text;
      if (projectionCsv && !projectionResult.conversionResult?.csvPreview.truncated) {
        expect(projectionCsv).toEqual(exportCsvResult.csv);
      }
    });
  }

  it("small input threshold is correctly applied for engine-level preview", () => {
    // Build a JSON input with a known small number of roots
    const roots = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `item-${i + 1}`,
      value: (i + 1) * 100,
    }));
    const json = { data: roots };
    const rootPath = "$.data[*]";

    const exportResult = convertJsonToCsvTable(json, { rootPath });

    // Preview with relaxed limits (roots count = 10, well under threshold)
    const relaxedPreview = convertJsonToCsvPreviewTable(
      json,
      { rootPath },
      {
        csvPreviewCharacterLimit: Number.POSITIVE_INFINITY,
        previewRowLimit: Number.MAX_SAFE_INTEGER,
        renderedRowBudget: undefined,
      },
    );

    // Should match export exactly
    expect(relaxedPreview.headers).toEqual(exportResult.headers);
    expect(relaxedPreview.records).toEqual(exportResult.records);
    expect(relaxedPreview.rowCount).toEqual(exportResult.records.length);
  });

  it("threshold constant is reasonable", () => {
    expect(projectionSmallInputRootThreshold).toBeGreaterThanOrEqual(100);
    expect(projectionSmallInputRootThreshold).toBeLessThanOrEqual(10_000);
  });
});
