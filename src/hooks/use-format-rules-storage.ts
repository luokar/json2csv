import type { FormatCondition, FormatRule } from "@/lib/conditional-formatting";

const storageKeyPrefix = "format-rules:";

const conditionTypes: ReadonlyArray<FormatCondition["type"]> = [
  "gt",
  "lt",
  "eq",
  "neq",
  "contains",
  "empty",
  "not-empty",
];

export function saveFormatRules(key: string, rules: FormatRule[]): void {
  try {
    localStorage.setItem(`${storageKeyPrefix}${key}`, JSON.stringify(rules));
  } catch {
    // Ignore quota errors.
  }
}

export function loadFormatRules(key: string): FormatRule[] | null {
  try {
    const raw = localStorage.getItem(`${storageKeyPrefix}${key}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid: FormatRule[] = [];
    for (const item of parsed) {
      if (isValidRule(item)) valid.push(item);
    }
    return valid;
  } catch {
    return null;
  }
}

function isValidRule(value: unknown): value is FormatRule {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (obj.columnId !== null && typeof obj.columnId !== "string") return false;
  if (typeof obj.style !== "object" || obj.style === null) return false;
  if (typeof obj.condition !== "object" || obj.condition === null) return false;
  const cond = obj.condition as { type?: unknown };
  if (typeof cond.type !== "string") return false;
  return conditionTypes.includes(cond.type as FormatCondition["type"]);
}
