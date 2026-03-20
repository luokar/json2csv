import { detectSmartConfigSuggestion } from "@/lib/smart-config";

describe("smart config detection", () => {
  it("detects keyed object maps that should become rows", () => {
    const suggestion = detectSmartConfigSuggestion({
      data: {
        "189512": {
          anomaly: -1.2,
          value: 51.4,
        },
        "189612": {
          anomaly: -0.9,
          value: 52.1,
        },
        "189712": {
          anomaly: -0.4,
          value: 52.6,
        },
        "189812": {
          anomaly: -0.2,
          value: 52.8,
        },
        "189912": {
          anomaly: 0.1,
          value: 53.1,
        },
      },
      description: {
        title: "NOAA style sample",
      },
    });

    expect(suggestion).toEqual(
      expect.objectContaining({
        entryCount: 5,
        keyAlias: "period",
        keySourcePath: "__entryKey",
        kind: "keyed-map",
        previewHeaders: ["period", "anomaly", "value"],
        recordMapPath: "$.data",
        rootPath: "$.data.*",
      }),
    );

    if (suggestion?.kind !== "keyed-map") {
      throw new Error("Expected a keyed-map smart-config suggestion.");
    }

    expect(suggestion.estimatedSiblingColumnsAvoided).toBeGreaterThan(0);
  });

  it("preserves complex multi-collection roots instead of narrowing them to one branch", () => {
    const suggestion = detectSmartConfigSuggestion({
      damage_relations: {
        double_damage_to: [{ name: "grass" }],
        half_damage_to: [{ name: "water" }],
      },
      game_indices: [{ game_index: 1, version: { name: "red" } }],
      generation: { name: "generation-i" },
      id: 10,
      moves: [{ move: { name: "ember" } }, { move: { name: "flamethrower" } }],
      name: "fire",
      pokemon: [{ pokemon: { name: "charizard" } }],
    });

    expect(suggestion?.kind).toBe("preserve-root");

    if (suggestion?.kind !== "preserve-root") {
      throw new Error("Expected a preserve-root smart-config suggestion.");
    }

    expect(suggestion.rootPath).toBe("$");
    expect(suggestion.flattenMode).toBe("stringify");
    expect(suggestion.repeatingBranches).toEqual(
      expect.arrayContaining(["damage_relations", "game_indices", "moves", "pokemon"]),
    );
    expect(suggestion.previewHeaders).toEqual(
      expect.arrayContaining(["id", "name", "damage_relations", "game_indices"]),
    );
  });

  it("prefers preserve-root over a keyed map when sibling collections would be dropped", () => {
    const suggestion = detectSmartConfigSuggestion({
      attachments: [{ id: "a-1" }],
      data: {
        "189512": { anomaly: -1.2, value: 51.4 },
        "189612": { anomaly: -0.9, value: 52.1 },
        "189712": { anomaly: -0.4, value: 52.6 },
        "189812": { anomaly: -0.2, value: 52.8 },
        "189912": { anomaly: 0.1, value: 53.1 },
      },
      notes: [{ id: "n-1", text: "keep me too" }],
      title: "NOAA plus siblings",
    });

    expect(suggestion?.kind).toBe("preserve-root");

    if (suggestion?.kind !== "preserve-root") {
      throw new Error("Expected preserve-root to win when sibling collections exist.");
    }

    expect(suggestion.rootPath).toBe("$");
    expect(suggestion.flattenMode).toBe("stringify");
  });

  it("ignores ordinary nested objects that are not record maps", () => {
    expect(
      detectSmartConfigSuggestion({
        metadata: {
          createdAt: "2026-03-15",
          owner: "ops",
          source: "manual",
        },
        summary: {
          active: true,
          count: 12,
        },
      }),
    ).toBeNull();
  });
});
