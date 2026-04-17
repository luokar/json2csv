import type { MappingConfig } from "@/lib/mapping-engine";
import type { ColumnProfile } from "@/lib/column-profiling";

export interface ExportedPipelineConfig {
  columnOrder: string[];
  exportedAt: string;
  headerAliases: Record<string, string>;
  mappingConfig: Partial<MappingConfig>;
  rootPath: string;
  source: { mode: "sample" | "custom"; sampleId?: string };
  version: 1;
}

export function buildPipelineConfig(options: {
  columnOrder: string[];
  headerAliases: Record<string, string>;
  mappingConfig: MappingConfig;
  rootPath: string;
  sampleId?: string;
  sourceMode: "sample" | "custom";
}): ExportedPipelineConfig {
  const {
    columnOrder,
    headerAliases,
    mappingConfig,
    rootPath,
    sampleId,
    sourceMode,
  } = options;

  return {
    columnOrder,
    exportedAt: new Date().toISOString(),
    headerAliases,
    mappingConfig: {
      arrayIndexSuffix: mappingConfig.arrayIndexSuffix,
      booleanRepresentation: mappingConfig.booleanRepresentation,
      collisionStrategy: mappingConfig.collisionStrategy,
      customPlaceholder: mappingConfig.customPlaceholder,
      dateFormat: mappingConfig.dateFormat,
      delimiter: mappingConfig.delimiter,
      emptyArrayBehavior: mappingConfig.emptyArrayBehavior,
      flattenMode: mappingConfig.flattenMode,
      maxDepth: mappingConfig.maxDepth,
      onMissingKey: mappingConfig.onMissingKey,
      onTypeMismatch: mappingConfig.onTypeMismatch,
      pathSeparator: mappingConfig.pathSeparator,
      placeholderStrategy: mappingConfig.placeholderStrategy,
      quoteAll: mappingConfig.quoteAll,
      strictNaming: mappingConfig.strictNaming,
    },
    rootPath,
    source: {
      mode: sourceMode,
      ...(sourceMode === "sample" && sampleId ? { sampleId } : {}),
    },
    version: 1,
  };
}

export function serializePipelineConfig(config: ExportedPipelineConfig): string {
  return JSON.stringify(config, null, 2);
}

export function parsePipelineConfig(
  json: string,
): ExportedPipelineConfig | { error: string } {
  try {
    const parsed = JSON.parse(json) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return { error: "Config must be a JSON object." };
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.version !== 1) {
      return { error: `Unsupported config version: ${String(obj.version)}.` };
    }

    if (typeof obj.rootPath !== "string") {
      return { error: "Missing or invalid rootPath." };
    }

    return obj as unknown as ExportedPipelineConfig;
  } catch (e) {
    return { error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function downloadPipelineConfig(
  config: ExportedPipelineConfig,
  fileName: string,
): void {
  const blob = new Blob([serializePipelineConfig(config)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".json") ? fileName : `${fileName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function generatePandasSnippet(config: ExportedPipelineConfig): string {
  const rootPath = config.rootPath;
  const delimiter = config.mappingConfig.delimiter ?? ",";
  const delimiterArg = delimiter === "," ? "" : `, sep="${delimiter === "\t" ? "\\t" : delimiter}"`;

  const recordPath = rootPath === "$" ? null : jsonPathToRecordPath(rootPath);
  const renameLines =
    Object.keys(config.headerAliases).length > 0
      ? `\n# Rename columns\ndf = df.rename(columns=${JSON.stringify(config.headerAliases)})`
      : "";
  const orderLines =
    config.columnOrder.length > 0
      ? `\n# Reorder columns\ndf = df[${JSON.stringify(config.columnOrder)}]`
      : "";

  return `import json
import pandas as pd

with open("data.json") as f:
    data = json.load(f)

${recordPath ? `df = pd.json_normalize(data, record_path=${JSON.stringify(recordPath)})` : "df = pd.json_normalize(data)"}${renameLines}${orderLines}

df.to_csv("output.csv", index=False${delimiterArg})
print(f"Exported {len(df)} rows to output.csv")
`;
}

export function generateJqSnippet(config: ExportedPipelineConfig): string {
  const rootPath = config.rootPath;
  const jqPath = jsonPathToJqPath(rootPath);
  const hasRenames = Object.keys(config.headerAliases).length > 0;
  const hasOrder = config.columnOrder.length > 0;

  if (!hasRenames && !hasOrder) {
    return `jq -r '${jqPath} | [.[]] | @csv' data.json`;
  }

  const columns = hasOrder ? config.columnOrder : [];
  const fields: string[] = [];

  if (hasRenames && hasOrder) {
    for (const col of columns) {
      const alias = config.headerAliases[col];
      if (alias) {
        fields.push(`"${alias}": .${escapeJqKey(col)}`);
      } else {
        fields.push(`"${col}": .${escapeJqKey(col)}`);
      }
    }
  } else if (hasRenames) {
    for (const [original, alias] of Object.entries(config.headerAliases)) {
      fields.push(`"${alias}": .${escapeJqKey(original)}`);
    }
  } else {
    for (const col of columns) {
      fields.push(`.${escapeJqKey(col)}`);
    }
  }

  if (hasRenames || (hasOrder && hasRenames)) {
    const selectExpr = `{${fields.join(", ")}}`;
    return `jq -r '[${jqPath} | ${selectExpr}] | (.[0] | keys_unsorted), (.[] | [.[]]) | @csv' data.json`;
  }

  const selectExpr = `[${fields.join(", ")}]`;
  const header = columns.map((c) => `"${config.headerAliases[c] ?? c}"`).join(",");
  return `# Header: ${header}\njq -r '${jqPath} | ${selectExpr} | @csv' data.json`;
}

export function generateSqlSnippet(
  config: ExportedPipelineConfig,
  profiles: ColumnProfile[],
): string {
  const tableName = "imported_data";
  const profileMap = new Map(profiles.map((p) => [p.header, p]));
  const columns = config.columnOrder.length > 0 ? config.columnOrder : profiles.map((p) => p.header);

  const columnDefs = columns.map((col) => {
    const displayName = config.headerAliases[col] ?? col;
    const sqlName = sanitizeSqlIdentifier(displayName);
    const profile = profileMap.get(col);
    const sqlType = mapToSqlType(profile?.dominantKind ?? null);
    const nullable = profile ? profile.emptyPercent > 0 : true;
    return `  ${sqlName} ${sqlType}${nullable ? "" : " NOT NULL"}`;
  });

  const copyColumns = columns
    .map((col) => sanitizeSqlIdentifier(config.headerAliases[col] ?? col))
    .join(", ");
  const delimiter = config.mappingConfig.delimiter ?? ",";
  const delimiterClause = delimiter === "," ? "" : ` DELIMITER '${delimiter === "\t" ? "\\t" : delimiter}'`;

  return `CREATE TABLE ${tableName} (\n${columnDefs.join(",\n")}\n);\n\n\\COPY ${tableName} (${copyColumns}) FROM 'output.csv' WITH (FORMAT csv, HEADER true${delimiterClause});`;
}

function jsonPathToJqPath(path: string): string {
  if (path === "$") return ".[]";
  return (
    "." +
    path
      .replace(/^\$\.?/, "")
      .replace(/\[\*\]/g, "[]")
  );
}

function escapeJqKey(key: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return key;
  return `"${key}"`;
}

function sanitizeSqlIdentifier(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return cleaned.toLowerCase();
}

function mapToSqlType(kind: string | null): string {
  switch (kind) {
    case "number":
      return "NUMERIC";
    case "boolean":
      return "BOOLEAN";
    default:
      return "TEXT";
  }
}

function jsonPathToRecordPath(path: string): string[] {
  return path
    .replace(/^\$\.?/, "")
    .replace(/\[\*\]/g, "")
    .split(".")
    .filter(Boolean);
}
