import type { ColumnTypeReport } from "@/lib/mapping-engine";
import { computeColumnProfiles } from "@/lib/column-profiling";

describe("computeColumnProfiles", () => {
  it("returns empty array for empty records", () => {
    expect(computeColumnProfiles([], ["id", "name"], [])).toEqual([]);
  });

  it("profiles string columns with top values and cardinality", () => {
    const records = [
      { city: "NYC", name: "Alice" },
      { city: "NYC", name: "Bob" },
      { city: "LA", name: "Charlie" },
      { city: "NYC", name: "Diana" },
    ];
    const typeReports: ColumnTypeReport[] = [
      {
        coercedTo: null,
        dominantKind: "string",
        exportHeaders: ["name"],
        header: "name",
        missingCount: 0,
        observedCount: 4,
        sourcePath: "name",
        typeBreakdown: [{ count: 4, kind: "string", percentage: 100 }],
      },
      {
        coercedTo: null,
        dominantKind: "string",
        exportHeaders: ["city"],
        header: "city",
        missingCount: 0,
        observedCount: 4,
        sourcePath: "city",
        typeBreakdown: [{ count: 4, kind: "string", percentage: 100 }],
      },
    ];

    const profiles = computeColumnProfiles(records, ["name", "city"], typeReports);

    expect(profiles).toHaveLength(2);

    const nameProfile = profiles[0]!;
    expect(nameProfile.header).toBe("name");
    expect(nameProfile.totalRows).toBe(4);
    expect(nameProfile.emptyCount).toBe(0);
    expect(nameProfile.uniqueCount).toBe(4);
    expect(nameProfile.cardinalityRatio).toBe(1);
    expect(nameProfile.dominantKind).toBe("string");
    expect(nameProfile.numeric).toBeNull();
    expect(nameProfile.stringLength).toEqual(
      expect.objectContaining({ min: 3, max: 7 }),
    );

    const cityProfile = profiles[1]!;
    expect(cityProfile.uniqueCount).toBe(2);
    expect(cityProfile.topValues[0]).toEqual(
      expect.objectContaining({ value: "NYC", count: 3 }),
    );
  });

  it("profiles numeric columns with min, max, mean, median", () => {
    const records = [
      { score: "10" },
      { score: "20" },
      { score: "30" },
      { score: "40" },
    ];
    const typeReports: ColumnTypeReport[] = [
      {
        coercedTo: null,
        dominantKind: "number",
        exportHeaders: ["score"],
        header: "score",
        missingCount: 0,
        observedCount: 4,
        sourcePath: "score",
        typeBreakdown: [{ count: 4, kind: "number", percentage: 100 }],
      },
    ];

    const profiles = computeColumnProfiles(records, ["score"], typeReports);
    const profile = profiles[0]!;

    expect(profile.numeric).toEqual({
      max: 40,
      mean: 25,
      median: 25,
      min: 10,
    });
    expect(profile.stringLength).toBeNull();
  });

  it("counts empty values and computes empty percentage", () => {
    const records: Array<Record<string, string>> = [
      { email: "a@test.com", id: "1" },
      { email: "", id: "2" },
      { email: "c@test.com", id: "3" },
      { id: "4" },
    ];

    const profiles = computeColumnProfiles(records, ["id", "email"], []);

    const emailProfile = profiles[1]!;
    expect(emailProfile.emptyCount).toBe(2);
    expect(emailProfile.emptyPercent).toBe(50);
    expect(emailProfile.uniqueCount).toBe(2);
  });

  it("handles odd-length arrays for median calculation", () => {
    const records = [
      { value: "1" },
      { value: "3" },
      { value: "5" },
    ];
    const typeReports: ColumnTypeReport[] = [
      {
        coercedTo: null,
        dominantKind: "number",
        exportHeaders: ["value"],
        header: "value",
        missingCount: 0,
        observedCount: 3,
        sourcePath: "value",
        typeBreakdown: [{ count: 3, kind: "number", percentage: 100 }],
      },
    ];

    const profiles = computeColumnProfiles(records, ["value"], typeReports);

    expect(profiles[0]!.numeric!.median).toBe(3);
  });

  it("produces top 5 values sorted by frequency", () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      category: `cat_${(i % 7) + 1}`,
    }));

    const profiles = computeColumnProfiles(records, ["category"], []);

    expect(profiles[0]!.topValues).toHaveLength(5);
    expect(profiles[0]!.topValues[0]!.count).toBeGreaterThanOrEqual(
      profiles[0]!.topValues[1]!.count,
    );
  });

  it("computes histogram for numeric columns with >= 5 values", () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      score: String(i * 10),
    }));
    const typeReports: ColumnTypeReport[] = [
      {
        coercedTo: null,
        dominantKind: "number",
        exportHeaders: ["score"],
        header: "score",
        missingCount: 0,
        observedCount: 20,
        sourcePath: "score",
        typeBreakdown: [{ count: 20, kind: "number", percentage: 100 }],
      },
    ];

    const profiles = computeColumnProfiles(records, ["score"], typeReports);
    const profile = profiles[0]!;

    expect(profile.histogram).not.toBeNull();
    expect(profile.histogram).toHaveLength(10);
    expect(profile.histogram![0]!.binStart).toBe(0);
    expect(profile.histogram![9]!.binEnd).toBe(190);

    const totalBinned = profile.histogram!.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinned).toBe(20);
  });

  it("does not compute histogram when fewer than 5 numeric values", () => {
    const records = [{ v: "1" }, { v: "2" }, { v: "3" }];
    const typeReports: ColumnTypeReport[] = [
      {
        coercedTo: null,
        dominantKind: "number",
        exportHeaders: ["v"],
        header: "v",
        missingCount: 0,
        observedCount: 3,
        sourcePath: "v",
        typeBreakdown: [{ count: 3, kind: "number", percentage: 100 }],
      },
    ];

    const profiles = computeColumnProfiles(records, ["v"], typeReports);
    expect(profiles[0]!.histogram).toBeNull();
  });

  it("does not compute histogram when all values are the same", () => {
    const records = Array.from({ length: 10 }, () => ({ v: "42" }));
    const typeReports: ColumnTypeReport[] = [
      {
        coercedTo: null,
        dominantKind: "number",
        exportHeaders: ["v"],
        header: "v",
        missingCount: 0,
        observedCount: 10,
        sourcePath: "v",
        typeBreakdown: [{ count: 10, kind: "number", percentage: 100 }],
      },
    ];

    const profiles = computeColumnProfiles(records, ["v"], typeReports);
    expect(profiles[0]!.histogram).toBeNull();
  });

  it("computes nullPattern thresholds correctly", () => {
    const makeRecords = (emptyCount: number, total: number) => {
      return Array.from({ length: total }, (_, i) => ({
        value: i < total - emptyCount ? "data" : "",
      }));
    };

    // 0% empty → "none"
    const p1 = computeColumnProfiles(makeRecords(0, 10), ["value"], []);
    expect(p1[0]!.nullPattern).toBe("none");

    // 5% empty → "sparse"
    const p2 = computeColumnProfiles(makeRecords(1, 20), ["value"], []);
    expect(p2[0]!.nullPattern).toBe("sparse");

    // 30% empty → "moderate"
    const p3 = computeColumnProfiles(makeRecords(3, 10), ["value"], []);
    expect(p3[0]!.nullPattern).toBe("moderate");

    // 80% empty → "heavy"
    const p4 = computeColumnProfiles(makeRecords(8, 10), ["value"], []);
    expect(p4[0]!.nullPattern).toBe("heavy");

    // 100% empty → "all"
    const p5 = computeColumnProfiles(makeRecords(10, 10), ["value"], []);
    expect(p5[0]!.nullPattern).toBe("all");
  });
});
