import { type InspectedPath, inspectMappingPaths, type MappingConfig } from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import {
  buildPlannerSuggestionFamilies,
  buildPlannerSuggestionTree,
  createPlannerRule,
  plannerRulesFromConfig,
  plannerRulesToConfig,
} from "@/lib/path-planner";

function createInspectedPath(path: string, kinds: InspectedPath["kinds"]) {
  return {
    count: 1,
    depth: path.split(".").length,
    kinds: [...kinds],
    path,
  } satisfies InspectedPath;
}

describe("path planner helpers", () => {
  it("serializes planner rules into mapping config overrides", () => {
    const config = plannerRulesToConfig([
      createPlannerRule({
        action: "include",
        path: "name",
      }),
      createPlannerRule({
        action: "mode",
        mode: "cross_product",
        path: " topping ",
      }),
      createPlannerRule({
        action: "drop",
        path: " user.password ",
      }),
      createPlannerRule({
        action: "stringify",
        path: "$.metadata[*]",
      }),
      createPlannerRule({
        action: "stringify",
        path: "$.topping[*]",
      }),
    ]);

    expect(config.includePaths).toEqual(["name"]);
    expect(config.pathModes).toEqual({});
    expect(config.stringifyPaths).toEqual(["metadata", "topping"]);
    expect(config.dropPaths).toEqual(["user.password"]);
  });

  it("rebuilds planner rows from saved config with drop precedence", () => {
    const config: Pick<
      MappingConfig,
      "dropPaths" | "includePaths" | "pathModes" | "stringifyPaths"
    > = {
      dropPaths: ["topping"],
      includePaths: ["name"],
      pathModes: {
        topping: "cross_product",
      },
      stringifyPaths: ["notes"],
    };

    expect(plannerRulesFromConfig(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "include",
          path: "name",
        }),
        expect.objectContaining({
          action: "stringify",
          path: "notes",
        }),
        expect.objectContaining({
          action: "drop",
          path: "topping",
        }),
      ]),
    );
  });

  it("inspects relative paths under the selected root", () => {
    const donutSample = mappingSamples.find((sample) => sample.id === "donuts");

    if (!donutSample) {
      throw new Error("Missing donut sample");
    }

    const inspectedPaths = inspectMappingPaths(donutSample.json, "$.items.item[*]");

    expect(inspectedPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          count: 2,
          depth: 1,
          kinds: expect.arrayContaining(["array", "object"]),
          path: "topping",
        }),
        expect.objectContaining({
          count: 10,
          depth: 2,
          kinds: ["string"],
          path: "topping.type",
        }),
      ]),
    );

    expect(inspectedPaths.some((entry) => entry.path.startsWith("items."))).toBe(false);
  });

  it("builds a nested planner tree with active rules and split recommendations", () => {
    const tree = buildPlannerSuggestionTree(
      [
        {
          count: 2,
          depth: 1,
          kinds: ["array", "object"],
          path: "topping",
        },
        {
          count: 10,
          depth: 2,
          kinds: ["string"],
          path: "topping.type",
        },
        {
          count: 2,
          depth: 1,
          kinds: ["object"],
          path: "metadata",
        },
      ],
      [
        createPlannerRule({
          action: "drop",
          path: "metadata",
        }),
        createPlannerRule({
          action: "stringify",
          path: "topping",
        }),
      ],
    );

    expect(tree).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "metadata",
          rule: expect.objectContaining({
            action: "drop",
            path: "metadata",
          }),
        }),
        expect.objectContaining({
          path: "topping",
          recommendation: expect.objectContaining({
            label: "Split candidate",
          }),
          rule: expect.objectContaining({
            action: "stringify",
            path: "topping",
          }),
          children: expect.arrayContaining([
            expect.objectContaining({
              path: "topping.type",
              segment: "type",
            }),
          ]),
        }),
      ]),
    );
  });

  it("builds grouped planner families for large path sets", () => {
    const families = buildPlannerSuggestionFamilies([
      ...Array.from({ length: 800 }, (_, index) =>
        createInspectedPath(`paths.route_${index}.get.operationId`, ["string"]),
      ),
      ...Array.from({ length: 800 }, (_, index) =>
        createInspectedPath(`paths.route_${index}.get.summary`, ["string"]),
      ),
      ...Array.from({ length: 250 }, (_, index) =>
        createInspectedPath(`components.schemas.Model_${index}.properties.id`, ["object"]),
      ),
    ]);

    expect(families.map((family) => family.path)).toContain("paths");
    expect(families.map((family) => family.path)).toContain("components.schemas");
    expect(families.map((family) => family.path)).not.toContain("paths.route_0");
  });
});
