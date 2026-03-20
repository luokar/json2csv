import { mappingSamples } from "@/lib/mapping-samples";
import { splitJsonToRelationalTables } from "@/lib/relational-split";

describe("relational split", () => {
  const donutSample = mappingSamples.find((sample) => sample.id === "donuts");

  if (!donutSample) {
    throw new Error("Missing donut sample");
  }

  it("normalizes repeated child arrays into linked tables", () => {
    const result = splitJsonToRelationalTables(donutSample.json, {
      rootPath: "$.items.item[*]",
    });

    expect(result.tables.map((table) => table.tableName)).toEqual([
      "root",
      "batters_batter",
      "topping",
    ]);
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childTable: "batters_batter",
          foreignKeyColumn: "parent_root_id",
          parentIdColumn: "root_id",
          parentTable: "root",
        }),
        expect.objectContaining({
          childTable: "topping",
          foreignKeyColumn: "parent_root_id",
          parentIdColumn: "root_id",
          parentTable: "root",
        }),
      ]),
    );

    const rootTable = result.tables[0];
    const batterTable = result.tables[1];
    const toppingTable = result.tables[2];

    expect(rootTable.rowCount).toBe(2);
    expect(rootTable.headers).toEqual([
      "root_id",
      "id",
      "type",
      "name",
      "ppu",
      "organic",
      "createdAt",
    ]);
    expect(batterTable.rowCount).toBe(5);
    expect(batterTable.headers).toEqual(["batters_batter_id", "parent_root_id", "id", "type"]);
    expect(batterTable.records[0]).toEqual({
      batters_batter_id: "batters_batter_1",
      parent_root_id: "root_1",
      id: "1001",
      type: "Regular",
    });
    expect(toppingTable.rowCount).toBe(10);
    expect(toppingTable.records.at(-1)).toEqual(
      expect.objectContaining({
        parent_root_id: "root_2",
        type: "Sugar",
      }),
    );
  });

  it("emits scalar child arrays as value tables", () => {
    const result = splitJsonToRelationalTables(
      {
        records: [
          { id: "a1", tags: ["fast", "stable"] },
          { id: "a2", tags: [] },
        ],
      },
      {
        rootPath: "$.records[*]",
      },
    );

    const tagsTable = result.tables.find((table) => table.tableName === "tags");

    expect(tagsTable).toEqual(
      expect.objectContaining({
        headers: ["tags_id", "parent_root_id", "value"],
        parentIdColumn: "parent_root_id",
        parentTable: "root",
        rowCount: 2,
      }),
    );
    expect(tagsTable?.records).toEqual([
      {
        parent_root_id: "root_1",
        tags_id: "tags_1",
        value: "fast",
      },
      {
        parent_root_id: "root_1",
        tags_id: "tags_2",
        value: "stable",
      },
    ]);
  });

  it("respects include paths when deciding which relational tables to emit", () => {
    const result = splitJsonToRelationalTables(donutSample.json, {
      includePaths: ["name"],
      rootPath: "$.items.item[*]",
    });

    expect(result.tables.map((table) => table.tableName)).toEqual(["root"]);
    expect(result.tables[0]?.headers).toEqual(["root_id", "name"]);
    expect(result.tables[0]?.records).toEqual([
      {
        name: "Cake",
        root_id: "root_1",
      },
      {
        name: "Raised",
        root_id: "root_2",
      },
    ]);
  });

  it("links deeper nested arrays to their immediate parent table", () => {
    const result = splitJsonToRelationalTables(
      {
        orders: [
          {
            id: "o1",
            lineItems: [
              {
                discounts: [{ code: "D10" }, { code: "LOYAL" }],
                sku: "sku-1",
              },
            ],
          },
        ],
      },
      {
        rootPath: "$.orders[*]",
      },
    );

    expect(result.tables.map((table) => table.tableName)).toEqual([
      "root",
      "lineItems",
      "lineItems_discounts",
    ]);
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childTable: "lineItems",
          foreignKeyColumn: "parent_root_id",
          parentTable: "root",
        }),
        expect.objectContaining({
          childTable: "lineItems_discounts",
          foreignKeyColumn: "parent_lineItems_id",
          parentTable: "lineItems",
        }),
      ]),
    );

    const discountsTable = result.tables.find((table) => table.tableName === "lineItems_discounts");

    expect(discountsTable?.headers).toEqual([
      "lineItems_discounts_id",
      "parent_lineItems_id",
      "code",
    ]);
    expect(discountsTable?.records).toEqual([
      {
        code: "D10",
        lineItems_discounts_id: "lineItems_discounts_1",
        parent_lineItems_id: "lineItems_1",
      },
      {
        code: "LOYAL",
        lineItems_discounts_id: "lineItems_discounts_2",
        parent_lineItems_id: "lineItems_1",
      },
    ]);
  });

  it("applies aliases and explicit inclusion without dropping link columns", () => {
    const result = splitJsonToRelationalTables(donutSample.json, {
      headerAliases: {
        "batters.batter.type": "Batter_Name",
        name: "product_name",
      },
      headerPolicy: "explicit",
      headerWhitelist: ["name", "batters.batter.type"],
      rootPath: "$.items.item[*]",
    });

    expect(result.tables[0]?.headers).toEqual(["root_id", "product_name"]);
    expect(result.tables[1]?.headers).toEqual([
      "batters_batter_id",
      "parent_root_id",
      "Batter_Name",
    ]);
  });
});
