import type { CSSProperties } from "react";

export type FormatCondition =
  | { type: "gt"; value: number }
  | { type: "lt"; value: number }
  | { type: "eq"; value: string }
  | { type: "neq"; value: string }
  | { type: "contains"; value: string }
  | { type: "empty" }
  | { type: "not-empty" };

export interface FormatStyle {
  bg?: string;
  text?: string;
  bold?: boolean;
}

export interface FormatRule {
  id: string;
  columnId: string | null; // null = all columns
  condition: FormatCondition;
  style: FormatStyle;
}

export const FORMAT_PRESETS: Record<string, { label: string; style: FormatStyle }> = {
  redBg: { label: "Red", style: { bg: "#fecaca", text: "#991b1b" } },
  greenBg: { label: "Green", style: { bg: "#bbf7d0", text: "#166534" } },
  yellowBg: { label: "Yellow", style: { bg: "#fef08a", text: "#854d0e" } },
  blueBg: { label: "Blue", style: { bg: "#bfdbfe", text: "#1e40af" } },
  bold: { label: "Bold", style: { bold: true } },
};

export const CONDITION_LABELS: Record<FormatCondition["type"], string> = {
  gt: "Greater than",
  lt: "Less than",
  eq: "Equals",
  neq: "Not equals",
  contains: "Contains",
  empty: "Is empty",
  "not-empty": "Is not empty",
};

export function evaluateCondition(condition: FormatCondition, value: string): boolean {
  switch (condition.type) {
    case "empty":
      return value === "" || value === undefined || value === null;
    case "not-empty":
      return value !== "" && value !== undefined && value !== null;
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "contains":
      return value.toLowerCase().includes(condition.value.toLowerCase());
    case "gt": {
      const num = Number(value);
      return !Number.isNaN(num) && num > condition.value;
    }
    case "lt": {
      const num = Number(value);
      return !Number.isNaN(num) && num < condition.value;
    }
  }
}

export function getMatchingStyles(
  rules: FormatRule[],
  columnId: string,
  value: string,
): CSSProperties | null {
  let matched = false;
  const result: CSSProperties = {};

  for (const rule of rules) {
    if (rule.columnId !== null && rule.columnId !== columnId) continue;
    if (!evaluateCondition(rule.condition, value)) continue;
    matched = true;
    if (rule.style.bg) result.backgroundColor = rule.style.bg;
    if (rule.style.text) result.color = rule.style.text;
    if (rule.style.bold) result.fontWeight = "bold";
  }

  return matched ? result : null;
}

let nextId = 1;
export function createRuleId(): string {
  return `rule-${nextId++}`;
}
