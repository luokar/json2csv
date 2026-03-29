import { strFromU8 } from "fflate";
import { describe, expect, it } from "vite-plus/test";
import { createMappingConfig } from "@/lib/mapping-engine";
import {
  buildOutputExportArtifact,
  createOutputExportRequest,
  outputExportMimeTypes,
} from "@/lib/output-export";

describe("output export helpers", () => {
  it("builds a flat CSV export artifact", () => {
    const artifact = buildOutputExportArtifact(
      createOutputExportRequest({
        config: createMappingConfig({ rootPath: "$.items[*]" }),
        customJson: "",
        exportName: "Donut CSV export",
        rootPath: "$.items[*]",
        sampleJson: {
          items: [
            {
              id: "0001",
              name: "Cake",
              topping: [{ type: "None" }, { type: "Glazed" }],
            },
          ],
        },
        sourceMode: "sample",
      }),
    );

    expect(artifact.fileName).toBe("donut-csv-export.csv");
    expect(artifact.mimeType).toBe(outputExportMimeTypes.csv);
    expect(strFromU8(artifact.bytes)).toContain("name");
    expect(strFromU8(artifact.bytes)).toContain("topping.type");
  });

  it("rejects invalid custom JSON before building artifacts", () => {
    expect(() =>
      buildOutputExportArtifact(
        createOutputExportRequest({
          config: createMappingConfig({ rootPath: "$.items[*]" }),
          customJson: "",
          exportName: "Broken export",
          rootPath: "$.items[*]",
          sampleJson: { items: [] },
          sourceMode: "custom",
        }),
      ),
    ).toThrow("Paste JSON or upload a .json file.");
  });
});
