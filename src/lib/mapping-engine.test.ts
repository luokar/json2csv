import { convertJsonToCsvTable, createMappingConfig, selectRootNodes } from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";

describe("mapping engine", () => {
  function getSampleJson(sampleId: string) {
    const sample = mappingSamples.find((entry) => entry.id === sampleId);

    if (!sample) {
      throw new Error(`Missing sample: ${sampleId}`);
    }

    return sample.json;
  }

  const donutSample = getSampleJson("donuts");
  const heterogeneousSample = getSampleJson("heterogeneous");
  const collisionSample = getSampleJson("collisions");

  it("zips sibling arrays in parallel mode", () => {
    const result = convertJsonToCsvTable(donutSample, {
      rootPath: "$.items.item[*]",
      flattenMode: "parallel",
      headerPolicy: "full_scan",
    });

    expect(result.rowCount).toBe(10);
    expect(result.records[0]["batters.batter.type"]).toBe("Regular");
    expect(result.records[0]["topping.type"]).toBe("None");
    expect(result.records[6]["topping.type"]).toBe("Maple");
  });

  it("treats object-wildcard keyed maps as row roots", () => {
    expect(
      selectRootNodes(
        {
          data: {
            "189512": {
              anomaly: -1.2,
              value: 51.4,
            },
            "189612": {
              anomaly: -0.9,
              value: 52.1,
            },
          },
        },
        "$.data.*",
      ),
    ).toEqual([
      {
        __entryKey: "189512",
        anomaly: -1.2,
        value: 51.4,
      },
      {
        __entryKey: "189612",
        anomaly: -0.9,
        value: 52.1,
      },
    ]);
  });

  it("creates a cartesian product in cross-product mode", () => {
    const result = convertJsonToCsvTable(donutSample, {
      rootPath: "$.items.item[*]",
      flattenMode: "cross_product",
      headerPolicy: "full_scan",
    });

    expect(result.rowCount).toBe(31);
    expect(
      result.records.some(
        (record) =>
          record["batters.batter.type"] === "Chocolate" && record["topping.type"] === "Maple",
      ),
    ).toBe(true);
  });

  it("stringifies selected array paths", () => {
    const result = convertJsonToCsvTable(donutSample, {
      rootPath: "$.items.item[*]",
      flattenMode: "parallel",
      stringifyPaths: ["topping"],
    });

    expect(result.rowCount).toBe(5);
    expect(result.records[0].topping).toContain("Powdered Sugar");
  });

  it("whitelists included branches while still traversing ancestors", () => {
    const result = convertJsonToCsvTable(donutSample, {
      includePaths: ["topping.type"],
      rootPath: "$.items.item[*]",
      flattenMode: "parallel",
    });

    expect(result.headers).toEqual(["topping.type"]);
    expect(result.rowCount).toBe(10);
    expect(result.records[0]).toEqual({
      "topping.type": "None",
    });
    expect(result.records.at(-1)).toEqual({
      "topping.type": "Sugar",
    });
  });

  it("performs a full header scan for heterogeneous objects", () => {
    const result = convertJsonToCsvTable(heterogeneousSample, {
      rootPath: "$.records[*]",
      flattenMode: "stringify",
      onMissingKey: "include",
    });

    expect(result.rowCount).toBe(3);
    expect(result.headers).toEqual(
      expect.arrayContaining(["active", "id", "label", "notes.source", "price", "tags"]),
    );
    expect(result.records[1]["notes.source"]).toBe("manual");
    expect(result.records[2].tags).toContain("stable");
  });

  it("pivots non-row-expanding arrays into indexed columns when enabled", () => {
    const result = convertJsonToCsvTable(heterogeneousSample, {
      rootPath: "$.records[*]",
      flattenMode: "stringify",
      arrayIndexSuffix: true,
      onMissingKey: "include",
    });

    expect(result.rowCount).toBe(3);
    expect(result.headers).toEqual(expect.arrayContaining(["id", "tags[0]", "tags[1]"]));
    expect(result.records[2]["tags[0]"]).toBe("fast");
    expect(result.records[2]["tags[1]"]).toBe("stable");
    expect(result.schema.primaryKeys).toEqual(["$"]);
  });

  it("pivots path-specific stringify mode without forcing json strings", () => {
    const result = convertJsonToCsvTable(donutSample, {
      rootPath: "$.items.item[*]",
      flattenMode: "parallel",
      arrayIndexSuffix: true,
      pathModes: {
        topping: "stringify",
      },
    });

    expect(result.rowCount).toBe(5);
    expect(result.headers).toEqual(expect.arrayContaining(["topping[0].type", "topping[6].type"]));
    expect(result.records[0]["topping[0].type"]).toBe("None");
    expect(result.records[0]["topping[6].type"]).toBe("Maple");
  });

  it("keeps forced stringify paths as json strings even with indexed pivoting", () => {
    const result = convertJsonToCsvTable(donutSample, {
      rootPath: "$.items.item[*]",
      flattenMode: "parallel",
      arrayIndexSuffix: true,
      stringifyPaths: ["topping"],
    });

    expect(result.rowCount).toBe(5);
    expect(result.headers).toContain("topping");
    expect(result.headers).not.toContain("topping[0].type");
    expect(result.records[0].topping).toContain("Powdered Sugar");
  });

  it("renames colliding headers when strict naming is enabled", () => {
    const result = convertJsonToCsvTable(collisionSample, {
      rootPath: "$.rows[*]",
      pathSeparator: "_",
      flattenMode: "stringify",
      strictNaming: true,
    });

    expect(result.headers).toEqual(
      expect.arrayContaining(["user_id", "user_id_1", "meta_user_id"]),
    );
  });

  it("splits columns when types conflict and requested", () => {
    const result = convertJsonToCsvTable(heterogeneousSample, {
      rootPath: "$.records[*]",
      flattenMode: "stringify",
      onTypeMismatch: "split",
    });

    expect(result.headers).toEqual(expect.arrayContaining(["price_number", "price_string"]));
  });

  it("emits type statistics and coercion summaries for mixed columns", () => {
    const result = convertJsonToCsvTable(
      {
        records: [
          { id: "a1", price: 10 },
          { id: "a2", price: 12.5 },
          { id: "a3", price: "N/A" },
          { id: "a4" },
        ],
      },
      {
        rootPath: "$.records[*]",
        flattenMode: "stringify",
        onTypeMismatch: "coerce",
      },
    );

    const priceReport = result.schema.typeReports.find((report) => report.header === "price");

    expect(priceReport).toMatchObject({
      coercedTo: "string",
      dominantKind: "number",
      exportHeaders: ["price"],
      header: "price",
      missingCount: 1,
      observedCount: 3,
      sourcePath: "price",
    });
    expect(priceReport?.typeBreakdown).toEqual([
      expect.objectContaining({
        count: 2,
        kind: "number",
      }),
      expect.objectContaining({
        count: 1,
        kind: "string",
      }),
    ]);
    expect(priceReport?.typeBreakdown[0]?.percentage).toBeCloseTo(66.7, 1);
    expect(priceReport?.typeBreakdown[1]?.percentage).toBeCloseTo(33.3, 1);
  });

  it("replaces repeated parent values when placeholder strategy is empty", () => {
    const result = convertJsonToCsvTable(
      {
        orders: [
          {
            orderId: "100",
            items: [{ sku: "A" }, { sku: "B" }],
          },
        ],
      },
      createMappingConfig({
        rootPath: "$.orders[*]",
        flattenMode: "cross_product",
        placeholderStrategy: "empty",
      }),
    );

    expect(result.records[0].orderId).toBe("100");
    expect(result.records[1].orderId).toBe("");
    expect(result.records[1]["items.sku"]).toBe("B");
    expect(result.schema.primaryKeys).toEqual(["$", "items"]);
  });

  it("tracks structural lineage for exact placeholder behavior in cross-products", () => {
    const result = convertJsonToCsvTable(
      {
        orders: [
          {
            orderId: "100",
            items: [{ sku: "A" }, { sku: "B" }],
            discounts: [{ code: "X" }, { code: "Y" }],
          },
        ],
      },
      createMappingConfig({
        rootPath: "$.orders[*]",
        flattenMode: "cross_product",
        placeholderStrategy: "empty",
      }),
    );

    expect(result.records).toEqual([
      {
        "discounts.code": "X",
        "items.sku": "A",
        orderId: "100",
      },
      {
        "discounts.code": "Y",
        "items.sku": "",
        orderId: "",
      },
      {
        "discounts.code": "X",
        "items.sku": "B",
        orderId: "",
      },
      {
        "discounts.code": "Y",
        "items.sku": "",
        orderId: "",
      },
    ]);

    expect(result.rowProvenance).toEqual([
      {
        lineage: [
          { index: 0, path: "$" },
          { index: 0, path: "discounts" },
          { index: 0, path: "items" },
        ],
      },
      {
        lineage: [
          { index: 0, path: "$" },
          { index: 1, path: "discounts" },
          { index: 0, path: "items" },
        ],
      },
      {
        lineage: [
          { index: 0, path: "$" },
          { index: 0, path: "discounts" },
          { index: 1, path: "items" },
        ],
      },
      {
        lineage: [
          { index: 0, path: "$" },
          { index: 1, path: "discounts" },
          { index: 1, path: "items" },
        ],
      },
    ]);

    expect(result.schema.primaryKeys).toEqual(["$", "discounts", "items"]);
  });

  it("emits regroup keys for repeated donut branches", () => {
    const result = convertJsonToCsvTable(donutSample, {
      rootPath: "$.items.item[*]",
      flattenMode: "cross_product",
      headerPolicy: "full_scan",
    });

    expect(result.schema.primaryKeys).toEqual(["$", "topping", "batters.batter"]);
  });

  it("respects explicit header whitelists", () => {
    const result = convertJsonToCsvTable(heterogeneousSample, {
      rootPath: "$.records[*]",
      flattenMode: "stringify",
      headerPolicy: "explicit",
      headerWhitelist: ["id", "notes.source", "price"],
    });

    expect(result.headers).toEqual(["id", "notes.source", "price"]);
  });

  it("can skip or keep rows when arrays are empty", () => {
    const input = {
      orders: [
        {
          id: "100",
          items: [],
        },
      ],
    };

    const includeNull = convertJsonToCsvTable(input, {
      rootPath: "$.orders[*]",
      flattenMode: "parallel",
      emptyArrayBehavior: "include_null",
    });
    const skipRow = convertJsonToCsvTable(input, {
      rootPath: "$.orders[*]",
      flattenMode: "parallel",
      emptyArrayBehavior: "skip_row",
    });

    expect(includeNull.rowCount).toBe(1);
    expect(includeNull.records[0].id).toBe("100");
    expect(skipRow.rowCount).toBe(0);
  });
});
