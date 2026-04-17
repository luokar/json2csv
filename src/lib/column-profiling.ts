import type { ColumnTypeReport } from "@/lib/mapping-engine";

export interface ColumnProfile {
  cardinalityRatio: number;
  dominantKind: string | null;
  emptyCount: number;
  emptyPercent: number;
  header: string;
  histogram: Array<{ binEnd: number; binStart: number; count: number }> | null;
  nullPattern: "none" | "sparse" | "moderate" | "heavy" | "all";
  numeric: { max: number; mean: number; median: number; min: number } | null;
  sourcePath: string;
  stringLength: { avg: number; max: number; min: number } | null;
  topValues: Array<{ count: number; percent: number; value: string }>;
  totalRows: number;
  uniqueCount: number;
}

export function computeColumnProfiles(
  records: Array<Record<string, string>>,
  headers: string[],
  typeReports: ColumnTypeReport[],
): ColumnProfile[] {
  const totalRows = records.length;

  if (totalRows === 0) {
    return [];
  }

  const typeReportMap = new Map<string, ColumnTypeReport>();

  for (const report of typeReports) {
    typeReportMap.set(report.header, report);
  }

  return headers.map((header) => {
    const values: string[] = [];
    let emptyCount = 0;

    for (const record of records) {
      const value = record[header] ?? "";

      if (value === "") {
        emptyCount++;
      } else {
        values.push(value);
      }
    }

    const nonEmptyCount = values.length;
    const uniqueValues = new Set(values);
    const uniqueCount = uniqueValues.size;
    const cardinalityRatio = nonEmptyCount > 0 ? uniqueCount / nonEmptyCount : 0;

    const frequencyMap = new Map<string, number>();

    for (const value of values) {
      frequencyMap.set(value, (frequencyMap.get(value) ?? 0) + 1);
    }

    const topValues = [...frequencyMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({
        count,
        percent: nonEmptyCount > 0 ? (count / nonEmptyCount) * 100 : 0,
        value,
      }));

    const typeReport = typeReportMap.get(header);
    const dominantKind = typeReport?.dominantKind ?? null;
    const sourcePath = typeReport?.sourcePath ?? header;

    let numeric: ColumnProfile["numeric"] = null;
    let histogram: ColumnProfile["histogram"] = null;

    if (dominantKind === "number" && nonEmptyCount > 0) {
      const nums: number[] = [];

      for (const v of values) {
        const n = Number(v);

        if (!Number.isNaN(n)) {
          nums.push(n);
        }
      }

      if (nums.length > 0) {
        nums.sort((a, b) => a - b);
        const sum = nums.reduce((acc, n) => acc + n, 0);
        const mid = Math.floor(nums.length / 2);
        const median =
          nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!;

        numeric = {
          max: nums[nums.length - 1]!,
          mean: sum / nums.length,
          median,
          min: nums[0]!,
        };

        if (nums.length >= 5) {
          const binCount = 10;
          const range = numeric.max - numeric.min;

          if (range > 0) {
            const binWidth = range / binCount;
            const bins: Array<{ binEnd: number; binStart: number; count: number }> = [];

            for (let i = 0; i < binCount; i++) {
              bins.push({
                binEnd: numeric.min + binWidth * (i + 1),
                binStart: numeric.min + binWidth * i,
                count: 0,
              });
            }

            for (const n of nums) {
              let binIndex = Math.floor((n - numeric.min) / binWidth);
              if (binIndex >= binCount) binIndex = binCount - 1;
              bins[binIndex]!.count++;
            }

            histogram = bins;
          }
        }
      }
    }

    let stringLength: ColumnProfile["stringLength"] = null;

    if (
      (dominantKind === "string" || dominantKind === null) &&
      nonEmptyCount > 0
    ) {
      let minLen = Infinity;
      let maxLen = 0;
      let totalLen = 0;

      for (const v of values) {
        const len = v.length;
        if (len < minLen) minLen = len;
        if (len > maxLen) maxLen = len;
        totalLen += len;
      }

      stringLength = {
        avg: totalLen / nonEmptyCount,
        max: maxLen,
        min: minLen === Infinity ? 0 : minLen,
      };
    }

    const emptyPercent = totalRows > 0 ? (emptyCount / totalRows) * 100 : 0;
    const nullPattern: ColumnProfile["nullPattern"] =
      emptyPercent === 0
        ? "none"
        : emptyPercent < 10
          ? "sparse"
          : emptyPercent < 50
            ? "moderate"
            : emptyPercent < 90
              ? "heavy"
              : emptyPercent < 100
                ? "heavy"
                : "all";

    return {
      cardinalityRatio,
      dominantKind,
      emptyCount,
      emptyPercent,
      header,
      histogram,
      nullPattern,
      numeric,
      sourcePath,
      stringLength,
      topValues,
      totalRows,
      uniqueCount,
    };
  });
}
