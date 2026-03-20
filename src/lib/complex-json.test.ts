import { buildComplexJsonOverview } from "@/lib/complex-json";
import type { InspectedPath } from "@/lib/mapping-engine";

function createInspectedPath(path: string, kinds: InspectedPath["kinds"]) {
  return {
    count: 1,
    depth: path.split(".").length,
    kinds: [...kinds],
    path,
  } satisfies InspectedPath;
}

describe("buildComplexJsonOverview", () => {
  it("returns null for small or already narrowed roots", () => {
    expect(buildComplexJsonOverview([createInspectedPath("name", ["string"])], 1, "$")).toBeNull();

    expect(
      buildComplexJsonOverview(
        Array.from({ length: 3_000 }, (_, index) =>
          createInspectedPath(`records.field_${index}`, ["string"]),
        ),
        10,
        "$.records[*]",
      ),
    ).toBeNull();
  });

  it("summarizes broad complex roots into candidate branches", () => {
    const overview = buildComplexJsonOverview(
      [
        ...Array.from({ length: 1_300 }, (_, index) =>
          createInspectedPath(`paths.route_${index}.get.operationId`, ["string"]),
        ),
        ...Array.from({ length: 1_300 }, (_, index) =>
          createInspectedPath(`components.schemas.Model_${index}.properties.id`, ["object"]),
        ),
        {
          count: 71,
          depth: 2,
          kinds: ["array"],
          path: "tags[*].name",
        } satisfies InspectedPath,
      ],
      600,
      "$",
    );

    expect(overview).not.toBeNull();
    expect(overview?.totalPathCount).toBe(2_601);
    expect(overview?.columnCount).toBe(600);
    expect(overview?.topLevelBranches.map((branch) => branch.path)).toContain("paths");
    expect(overview?.topLevelBranches.map((branch) => branch.path)).toContain("components");
    expect(overview?.candidateRoots.map((branch) => branch.path)).toContain("components.schemas");
    expect(overview?.candidateRoots.map((branch) => branch.path)).toContain("paths");
    expect(overview?.candidateRoots.map((branch) => branch.path)).not.toContain("paths.route_0");
    expect(overview?.candidateRoots.some((branch) => branch.hasArray)).toBe(true);
  });

  it("suppresses high-cardinality keyed children from candidate roots", () => {
    const overview = buildComplexJsonOverview(
      [
        ...Array.from({ length: 1_100 }, (_, index) =>
          createInspectedPath(`paths.route_${index}.get.operationId`, ["string"]),
        ),
        ...Array.from({ length: 1_100 }, (_, index) =>
          createInspectedPath(`paths.route_${index}.get.summary`, ["string"]),
        ),
        ...Array.from({ length: 300 }, (_, index) =>
          createInspectedPath(`components.schemas.Model_${index}.properties.id`, ["object"]),
        ),
      ],
      600,
      "$",
    );

    expect(overview).not.toBeNull();
    expect(overview?.candidateRoots.map((branch) => branch.path)).toContain("paths");
    expect(overview?.candidateRoots.map((branch) => branch.path)).toContain("components.schemas");
    expect(overview?.candidateRoots.map((branch) => branch.path)).not.toContain("paths.route_0");
  });
});
