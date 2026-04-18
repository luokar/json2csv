const storageKeyPrefix = "column-prefs:";

export interface SerializedColumnPreferences {
  columnOrder: string[];
  headerAliases: Record<string, string>;
  hiddenColumns: string[];
  pinnedColumnId: string | null;
}

export function buildDatasetKey(
  sourceMode: "custom" | "sample",
  sampleId: string,
  headers: string[],
  rowCount: number,
): string {
  if (sourceMode === "sample") {
    return `sample:${sampleId}`;
  }
  return `custom:${headers.length}:${rowCount}:${headers.slice(0, 5).join(",")}`;
}

export function saveColumnPreferences(
  key: string,
  prefs: SerializedColumnPreferences,
): void {
  try {
    localStorage.setItem(
      `${storageKeyPrefix}${key}`,
      JSON.stringify(prefs),
    );
  } catch {
    // Silently ignore storage errors (quota exceeded, etc.)
  }
}

export function loadColumnPreferences(
  key: string,
): SerializedColumnPreferences | null {
  try {
    const raw = localStorage.getItem(`${storageKeyPrefix}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidPreferences(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isValidPreferences(value: unknown): value is SerializedColumnPreferences {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.columnOrder) &&
    typeof obj.headerAliases === "object" &&
    obj.headerAliases !== null &&
    Array.isArray(obj.hiddenColumns) &&
    (obj.pinnedColumnId === null || typeof obj.pinnedColumnId === "string")
  );
}
