import { parseJsonInput } from "@/lib/json-input";
import {
  convertJsonToCsvPreviewTable,
  type FlattenMode,
  type JsonValue,
  objectMapEntryKeyField,
  selectRootNodes,
} from "@/lib/mapping-engine";
import { detectSmartConfigSuggestion } from "@/lib/smart-config";

export type TablePlanKind = "category-union" | "entity" | "expanded-child" | "keyed-map";

export interface TablePlan {
  entryKeyAlias?: string;
  estimatedColumns: number;
  estimatedRows: number;
  flattenMode: FlattenMode;
  id: string;
  kind: TablePlanKind;
  label: string;
  pathModes: Record<string, FlattenMode>;
  previewHeaders: string[];
  rootPath: string;
  summary: string;
}

export interface TablePlanAnalysis {
  error: string | null;
  plans: TablePlan[];
  scopePath: string;
}

export interface TablePlanRequest {
  customJson: string;
  rootPath: string;
  sampleJson: JsonValue;
  sourceMode: "custom" | "sample";
}

export interface TablePlanWorkerRequest {
  payload: TablePlanRequest;
  requestId: number;
}

export interface TablePlanWorkerResponse {
  payload: TablePlanAnalysis;
  requestId: number;
}

interface TablePlanDraft {
  entryKeyAlias?: string;
  estimatedRows: number;
  kind: TablePlanKind;
  label: string;
  pathModes: Record<string, FlattenMode>;
  rootPath: string;
  summary: string;
}

const collectionScanDepthLimit = 5;
const headerProfileRootLimit = 200;
const headerPreviewLimit = 8;

export function analyzeTablePlanRequest(request: TablePlanRequest): TablePlanAnalysis {
  const parsedInput =
    request.sourceMode === "custom"
      ? parseJsonInput(request.customJson)
      : { error: undefined, value: request.sampleJson };

  if (parsedInput.value === undefined) {
    return {
      error: parsedInput.error ?? "Invalid JSON input.",
      plans: [],
      scopePath: request.rootPath,
    };
  }

  try {
    return analyzeTablePlans(parsedInput.value, request.rootPath);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Table analysis failed.",
      plans: [],
      scopePath: request.rootPath,
    };
  }
}

export function analyzeTablePlans(input: JsonValue, scopePath = "$"): TablePlanAnalysis {
  const drafts: TablePlanDraft[] = [];

  if (Array.isArray(input)) {
    addArrayPlans(drafts, input, "Rows", "$[*]");
  } else if (isPlainObject(input)) {
    collectCollectionPlans(input, "$", drafts, 0);
  }

  addKeyedMapPlan(input, drafts);

  const uniqueDrafts = deduplicateDrafts(drafts);
  const scopedDrafts = filterDraftsToScope(uniqueDrafts, scopePath);
  const applicableDrafts =
    scopedDrafts.length > 0 ? scopedDrafts : createCurrentScopeFallback(input, scopePath);

  return {
    error: null,
    plans: applicableDrafts.map((draft) => profileTablePlan(input, draft)),
    scopePath,
  };
}

function collectCollectionPlans(
  container: Record<string, JsonValue>,
  path: string,
  drafts: TablePlanDraft[],
  depth: number,
) {
  if (depth >= collectionScanDepthLimit) {
    return;
  }

  for (const [key, value] of Object.entries(container)) {
    const childPath = appendProperty(path, key);

    if (Array.isArray(value)) {
      addArrayPlans(drafts, value, humanizeIdentifier(key), `${childPath}[*]`);
      continue;
    }

    if (!isPlainObject(value)) {
      continue;
    }

    if (isArrayCategoryMap(value)) {
      const estimatedRows = Object.values(value).reduce<number>(
        (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
        0,
      );

      drafts.push({
        entryKeyAlias: `${toCamelCase(key)}Type`,
        estimatedRows,
        kind: "category-union",
        label: humanizeIdentifier(key),
        pathModes: {},
        rootPath: `${childPath}.*`,
        summary: `Combine ${Object.keys(value).length.toLocaleString()} categories while retaining the category key.`,
      });
      continue;
    }

    collectCollectionPlans(value, childPath, drafts, depth + 1);
  }
}

function addArrayPlans(
  drafts: TablePlanDraft[],
  collection: JsonValue[],
  label: string,
  rootPath: string,
) {
  const arrayPaths = collectNestedArrayPaths(collection);
  const entityPathModes = Object.fromEntries(
    arrayPaths.map((path) => [path, "stringify" as const]),
  );

  drafts.push({
    estimatedRows: collection.length,
    kind: "entity",
    label,
    pathModes: entityPathModes,
    rootPath,
    summary:
      arrayPaths.length > 0
        ? `Keep one row per ${label.toLocaleLowerCase()} and store ${arrayPaths.length.toLocaleString()} nested list${arrayPaths.length === 1 ? "" : "s"} as JSON.`
        : `Keep one row per ${label.toLocaleLowerCase()}.`,
  });

  if (!collection.every(isPlainObject)) {
    return;
  }

  const directArrayKeys = collectDirectArrayKeys(collection);

  for (const key of directArrayKeys) {
    const estimatedRows = collection.reduce((total, entry) => {
      const value = entry[key];
      return total + (Array.isArray(value) ? Math.max(value.length, 1) : 1);
    }, 0);

    if (estimatedRows <= collection.length) {
      continue;
    }

    drafts.push({
      estimatedRows,
      kind: "expanded-child",
      label: `${label} — ${humanizeIdentifier(key)}`,
      pathModes: {
        ...entityPathModes,
        [key]: "parallel",
      },
      rootPath,
      summary: `Expand ${key} into rows and repeat the parent fields for each item.`,
    });
  }
}

function addKeyedMapPlan(input: JsonValue, drafts: TablePlanDraft[]) {
  const suggestion = detectSmartConfigSuggestion(input);

  if (suggestion?.kind !== "keyed-map") {
    return;
  }

  drafts.push({
    entryKeyAlias: suggestion.keyAlias,
    estimatedRows: suggestion.entryCount,
    kind: "keyed-map",
    label: humanizePath(suggestion.recordMapPath),
    pathModes: {},
    rootPath: suggestion.rootPath,
    summary: suggestion.summary,
  });
}

function profileTablePlan(input: JsonValue, draft: TablePlanDraft): TablePlan {
  const headerAliases: Record<string, string> = draft.entryKeyAlias
    ? { [objectMapEntryKeyField]: draft.entryKeyAlias }
    : {};
  const preview = convertJsonToCsvPreviewTable(
    input,
    {
      flattenMode: "parallel",
      headerAliases,
      pathModes: draft.pathModes,
      rootPath: draft.rootPath,
    },
    {
      csvPreviewCharacterLimit: 1,
      previewRowLimit: 1,
      renderedRowBudget: 2_000,
      rootLimit: headerProfileRootLimit,
    },
  );

  return {
    ...draft,
    estimatedColumns: preview.headers.length,
    flattenMode: "parallel",
    id: `${draft.kind}:${draft.rootPath}:${draft.label}`,
    previewHeaders: preview.headers.slice(0, headerPreviewLimit),
  };
}

function collectNestedArrayPaths(collection: JsonValue[]) {
  const paths = new Set<string>();

  for (const value of sampleAcrossCollection(collection, headerProfileRootLimit)) {
    collectArrayPathsFromValue(value, "", paths, 0);
  }

  return [...paths].sort((left, right) => left.localeCompare(right));
}

function sampleAcrossCollection(collection: JsonValue[], limit: number) {
  if (collection.length <= limit) {
    return collection;
  }

  const sample: JsonValue[] = [];
  const stride = (collection.length - 1) / (limit - 1);

  for (let index = 0; index < limit; index += 1) {
    const value = collection[Math.round(index * stride)];

    if (value !== undefined) {
      sample.push(value);
    }
  }

  return sample;
}

function collectArrayPathsFromValue(
  value: JsonValue,
  path: string,
  paths: Set<string>,
  depth: number,
) {
  if (depth >= collectionScanDepthLimit) {
    return;
  }

  if (Array.isArray(value)) {
    if (path) {
      paths.add(path);
    }
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    collectArrayPathsFromValue(childValue, path ? `${path}.${key}` : key, paths, depth + 1);
  }
}

function collectDirectArrayKeys(collection: Array<Record<string, JsonValue>>) {
  const keys = new Set<string>();

  for (const entry of collection) {
    for (const [key, value] of Object.entries(entry)) {
      if (Array.isArray(value)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

function filterDraftsToScope(drafts: TablePlanDraft[], scopePath: string) {
  const normalizedScope = normalizeScopePath(scopePath);

  if (normalizedScope === "$" || !normalizedScope) {
    return drafts;
  }

  return drafts.filter((draft) => {
    const normalizedPlanPath = normalizeScopePath(draft.rootPath);
    return (
      normalizedPlanPath === normalizedScope ||
      normalizedPlanPath.startsWith(`${normalizedScope}.`)
    );
  });
}

function createCurrentScopeFallback(input: JsonValue, scopePath: string): TablePlanDraft[] {
  const selected = selectRootNodes(input, scopePath);
  const selectedCollection =
    selected.length === 1 && Array.isArray(selected[0]) ? selected[0] : (selected as JsonValue[]);

  if (selectedCollection.length === 0) {
    return [];
  }

  const rootPath =
    selected.length === 1 && Array.isArray(selected[0]) && !scopePath.endsWith("[*]")
      ? `${scopePath}[*]`
      : scopePath;
  const drafts: TablePlanDraft[] = [];
  addArrayPlans(drafts, selectedCollection, humanizePath(scopePath), rootPath);
  return drafts.slice(0, 1);
}

function deduplicateDrafts(drafts: TablePlanDraft[]) {
  const seen = new Set<string>();

  return drafts.filter((draft) => {
    const key = `${draft.kind}:${draft.rootPath}:${draft.label}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isArrayCategoryMap(value: Record<string, JsonValue>) {
  const entries = Object.values(value);
  return entries.length >= 2 && entries.every(Array.isArray);
}

function normalizeScopePath(path: string) {
  return path.trim().replace(/\[\*\]/g, "").replace(/\.\*$/, "").replace(/\.$/, "");
}

function appendProperty(path: string, key: string) {
  return path === "$" ? `$.${key}` : `${path}.${key}`;
}

function humanizePath(path: string) {
  const segment = normalizeScopePath(path).split(".").filter(Boolean).at(-1) ?? "Rows";
  return humanizeIdentifier(segment.replace(/^\$/, ""));
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toCamelCase(value: string) {
  const words = humanizeIdentifier(value).split(" ");
  return words
    .map((word, index) =>
      index === 0
        ? word.slice(0, 1).toLowerCase() + word.slice(1)
        : word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
}

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
