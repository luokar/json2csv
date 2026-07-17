import {
  analyzeTablePlanRequest,
  analyzeTablePlans,
} from "@/lib/table-planner";

const bundleShape = {
  models: [
    {
      creator: { id: "openai", name: "OpenAI" },
      id: "model-1",
      metrics: { evaluations: [{ score: 91 }, { score: 92 }] },
    },
    {
      creator: { id: "anthropic", name: "Anthropic" },
      id: "model-2",
      metrics: { evaluations: [{ score: 93 }] },
    },
  ],
  media: {
    imageEditing: [{ id: "media-2", name: "Editor" }],
    textToImage: [
      { id: "media-1", name: "Painter" },
      { id: "media-2", name: "Editor" },
    ],
  },
  hostModelsOverTime: [
    {
      hostModelId: "host-1",
      performanceOverTime: [
        { date: "2026-07-01", speed: 10 },
        { date: "2026-07-02", speed: 12 },
      ],
    },
  ],
};

describe("table planner", () => {
  it("finds entity, category-union, and expanded child tables", () => {
    const result = analyzeTablePlans(bundleShape, "$");

    expect(result.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          estimatedRows: 2,
          label: "Models",
          pathModes: { "metrics.evaluations": "stringify" },
          rootPath: "$.models[*]",
        }),
        expect.objectContaining({
          entryKeyAlias: "mediaType",
          estimatedRows: 3,
          label: "Media",
          rootPath: "$.media.*",
        }),
        expect.objectContaining({
          estimatedRows: 2,
          label: "Host Models Over Time — Performance Over Time",
          rootPath: "$.hostModelsOverTime[*]",
        }),
      ]),
    );
  });

  it("keeps suggestions inside the current data location", () => {
    const result = analyzeTablePlans(bundleShape, "$.models[*]");

    expect(result.plans).not.toHaveLength(0);
    expect(result.plans.every((plan) => plan.rootPath === "$.models[*]")).toBe(true);
    expect(result.plans.some((plan) => plan.label === "Media")).toBe(false);
  });

  it("analyzes oversized custom JSON independently from preview suspension", () => {
    const result = analyzeTablePlanRequest({
      customJson: JSON.stringify({
        blob: "x".repeat(600_000),
        models: [{ id: "model-1" }, { id: "model-2" }],
      }),
      rootPath: "$",
      sampleJson: null,
      sourceMode: "custom",
    });

    expect(result.error).toBeNull();
    expect(result.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ estimatedRows: 2, rootPath: "$.models[*]" }),
      ]),
    );
  });
});
