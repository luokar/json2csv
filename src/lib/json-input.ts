import type { JsonValue } from "@/lib/mapping-engine";

export interface ParsedJsonInput {
  error?: string;
  formattedText?: string;
  value?: JsonValue;
}

export function parseJsonInput(text: string): ParsedJsonInput {
  if (!text.trim()) {
    return {
      error: "Paste JSON or upload a .json file.",
    };
  }

  try {
    return {
      value: JSON.parse(text) as JsonValue,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid JSON input.",
    };
  }
}

export function stringifyJsonInput(value: JsonValue) {
  return JSON.stringify(value, null, 2);
}

export function formatJsonInput(text: string): ParsedJsonInput {
  const parsed = parseJsonInput(text);

  if (parsed.value === undefined) {
    return parsed;
  }

  return {
    formattedText: stringifyJsonInput(parsed.value),
    value: parsed.value,
  };
}
