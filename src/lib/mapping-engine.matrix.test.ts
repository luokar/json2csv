import { convertJsonToCsvTable } from "@/lib/mapping-engine";

const deepProjectInput = {
  projects: [
    {
      id: "p1",
      metadata: {
        tags: ["alpha", "beta"],
      },
      groups: [
        {
          name: "g1",
          users: [
            { id: "u1", roles: ["owner", "editor"] },
            { id: "u2", roles: ["viewer", "guest"] },
          ],
        },
        {
          name: "g2",
          users: [{ id: "u3", roles: ["admin"] }],
        },
      ],
    },
  ],
};

const groupRootInput = {
  projects: [
    {
      groups: [
        {
          name: "g1",
          users: [
            { id: "u1", roles: ["owner", "editor"] },
            { id: "u2", roles: ["viewer", "guest"] },
          ],
        },
      ],
    },
  ],
};

describe("mapping engine deep matrix", () => {
  it("switches nested containers to stringify while the selected root stays parallel", () => {
    const result = convertJsonToCsvTable(
      {
        models: [
          {
            creator: { id: "openai", name: "OpenAI" },
            id: "model-1",
            scores: [91, 92],
          },
          {
            creator: { id: "anthropic", name: "Anthropic" },
            id: "model-2",
            scores: [93],
          },
        ],
      },
      {
        flattenMode: "parallel",
        headerPolicy: "full_scan",
        nestedFlattenDepth: 1,
        nestedFlattenMode: "stringify",
        rootPath: "$.models",
      },
    );

    expect(result.rowCount).toBe(2);
    expect(result.headers).toEqual(["creator", "id", "scores"]);
    expect(result.headers).not.toContain("creator.name");
    expect(result.records[0]).toMatchObject({
      creator: '{"id":"openai","name":"OpenAI"}',
      id: "model-1",
      scores: "[91,92]",
    });
    expect(result.records[1]).toMatchObject({
      creator: '{"id":"anthropic","name":"Anthropic"}',
      id: "model-2",
      scores: "[93]",
    });
  });

  it("keeps flattening until the configured nested level", () => {
    const result = convertJsonToCsvTable(
      {
        models: [
          {
            id: "model-1",
            profile: {
              metrics: { quality: 92, speed: 88 },
              name: "Model One",
            },
          },
        ],
      },
      {
        flattenMode: "parallel",
        headerPolicy: "full_scan",
        nestedFlattenDepth: 2,
        nestedFlattenMode: "stringify",
        rootPath: "$.models",
      },
    );

    expect(result.rowCount).toBe(1);
    expect(result.headers).toEqual(["id", "profile.metrics", "profile.name"]);
    expect(result.records[0]["profile.metrics"]).toBe('{"quality":92,"speed":88}');
    expect(result.records[0]["profile.name"]).toBe("Model One");
  });

  it("keeps deep arrays in-row by default in strict-leaf mode", () => {
    const result = convertJsonToCsvTable(deepProjectInput, {
      rootPath: "$.projects[*]",
      flattenMode: "strict_leaf",
      headerPolicy: "full_scan",
    });

    expect(result.rowCount).toBe(1);
    expect(result.headers).toEqual(expect.arrayContaining(["groups", "id", "metadata.tags"]));
    expect(result.headers).not.toContain("groups.name");
    expect(result.records[0].groups).toContain("u1");
    expect(result.records[0]["metadata.tags"]).toContain("alpha");
  });

  it("lets strict-leaf expand selected deep paths while sibling arrays stay stringified", () => {
    const result = convertJsonToCsvTable(deepProjectInput, {
      rootPath: "$.projects[*]",
      flattenMode: "strict_leaf",
      headerPolicy: "full_scan",
      pathModes: {
        groups: "cross_product",
        "groups.users": "cross_product",
      },
    });

    expect(result.rowCount).toBe(3);
    expect(result.headers).toEqual(
      expect.arrayContaining([
        "groups.name",
        "groups.users.id",
        "groups.users.roles",
        "id",
        "metadata.tags",
      ]),
    );
    expect(result.records[0]["groups.users.roles"]).toContain("owner");
    expect(result.records[2]["groups.name"]).toBe("g2");
    expect(result.records[2]["groups.users.id"]).toBe("u3");
    expect(result.records[0]["metadata.tags"]).toContain("beta");
  });

  it("prefers the longest matching path override for deep nested arrays", () => {
    const result = convertJsonToCsvTable(groupRootInput, {
      rootPath: "$.projects[*].groups[*]",
      flattenMode: "parallel",
      headerPolicy: "full_scan",
      arrayIndexSuffix: true,
      pathModes: {
        users: "cross_product",
        "users.roles": "stringify",
      },
    });

    expect(result.rowCount).toBe(2);
    expect(result.headers).toEqual(
      expect.arrayContaining(["name", "users.id", "users.roles[0]", "users.roles[1]"]),
    );
    expect(result.records[0]["users.roles[0]"]).toBe("owner");
    expect(result.records[0]["users.roles[1]"]).toBe("editor");
    expect(result.records[1]["users.roles[0]"]).toBe("viewer");
    expect(result.records[1]["users.roles[1]"]).toBe("guest");
  });

  it("lets explicit stringify paths override deeper row-expansion rules", () => {
    const result = convertJsonToCsvTable(groupRootInput, {
      rootPath: "$.projects[*].groups[*]",
      flattenMode: "parallel",
      headerPolicy: "full_scan",
      arrayIndexSuffix: true,
      pathModes: {
        users: "cross_product",
        "users.roles": "cross_product",
      },
      stringifyPaths: ["users.roles"],
    });

    expect(result.rowCount).toBe(2);
    expect(result.headers).toContain("users.roles");
    expect(result.headers).not.toContain("users.roles[0]");
    expect(result.records[0]["users.roles"]).toContain("owner");
    expect(result.records[1]["users.roles"]).toContain("guest");
  });
});
