import { strToU8, zipSync } from "fflate";
import { parseJsonInput } from "@/lib/json-input";
import { convertJsonToCsvTable, type JsonValue, type MappingConfig } from "@/lib/mapping-engine";
import type { ProjectionRequest } from "@/lib/projection";
import { type RelationalRelationship, splitJsonToRelationalTables } from "@/lib/relational-split";

const csvMimeType = "text/csv;charset=utf-8";
const jsonMimeType = "application/json;charset=utf-8";
const zipMimeType = "application/zip";
const defaultExportBaseName = "json2csv-export";

export interface OutputExportArtifact {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface OutputExportTableArtifact extends OutputExportArtifact {
  headers: string[];
  idColumn: string;
  parentIdColumn: string | null;
  parentTable: string | null;
  rowCount: number;
  sourcePath: string;
  tableName: string;
}

export interface OutputExportBundle {
  flatCsv: OutputExportArtifact;
  relationalArchive: OutputExportArtifact | null;
  relationalTables: OutputExportTableArtifact[];
}

export interface OutputExportRequest extends ProjectionRequest {
  exportName: string;
}

export interface OutputExportWorkerRequest {
  payload: OutputExportRequest;
  requestId: number;
}

export interface OutputExportWorkerResultResponse {
  payload: OutputExportBundle;
  requestId: number;
  type: "result";
}

export interface OutputExportWorkerErrorResponse {
  error: string;
  requestId: number;
  type: "error";
}

export type OutputExportWorkerResponse =
  | OutputExportWorkerErrorResponse
  | OutputExportWorkerResultResponse;

interface OutputExportManifest {
  exportName: string;
  generatedAt: string;
  relationships: RelationalRelationship[];
  rootPath: string;
  sourceMode: ProjectionRequest["sourceMode"];
  tables: Array<{
    fileName: string;
    headers: string[];
    idColumn: string;
    parentIdColumn: string | null;
    parentTable: string | null;
    rowCount: number;
    sourcePath: string;
    tableName: string;
  }>;
}

export function buildOutputExportBundle(request: OutputExportRequest): OutputExportBundle {
  if (!request.config) {
    throw new Error("Fix the current mapping config before exporting.");
  }

  const input = resolveExportInput(request);
  const flatResult = convertJsonToCsvTable(input, request.config);
  const relationalResult = splitJsonToRelationalTables(input, request.config);
  const exportBaseName = sanitizeExportSegment(request.exportName, defaultExportBaseName);
  const flatCsv = createTextArtifact(`${exportBaseName}.csv`, flatResult.csv, csvMimeType);
  const relationalTables = relationalResult.tables.map((table) => {
    const tableFileName = createRelationalTableFileName(exportBaseName, table.tableName);

    return {
      ...createTextArtifact(tableFileName, table.csv, csvMimeType),
      headers: table.headers,
      idColumn: table.idColumn,
      parentIdColumn: table.parentIdColumn,
      parentTable: table.parentTable,
      rowCount: table.rowCount,
      sourcePath: table.sourcePath,
      tableName: table.tableName,
    } satisfies OutputExportTableArtifact;
  });

  return {
    flatCsv,
    relationalArchive: createRelationalArchive(
      exportBaseName,
      request,
      relationalResult.relationships,
      relationalTables,
    ),
    relationalTables,
  };
}

export function downloadExportArtifact(artifact: OutputExportArtifact) {
  if (typeof document === "undefined") {
    return;
  }

  const blobBytes = new Uint8Array(artifact.bytes);
  const url = URL.createObjectURL(
    new Blob([blobBytes], {
      type: artifact.mimeType,
    }),
  );
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function createRelationalArchive(
  exportBaseName: string,
  request: OutputExportRequest,
  relationships: RelationalRelationship[],
  tables: OutputExportTableArtifact[],
): OutputExportArtifact | null {
  if (tables.length === 0) {
    return null;
  }

  const directory = `${exportBaseName}-relational`;
  const manifest = buildOutputExportManifest(request, relationships, tables);
  const tableEntries: Record<string, Uint8Array> = {
    "README.txt": normalizeBytes(
      strToU8("Each CSV is a normalized relational table derived from the current root selection."),
    ),
  };
  const archiveEntries = {
    [directory]: {
      "manifest.json": normalizeBytes(strToU8(JSON.stringify(manifest, null, 2))),
      tables: tableEntries,
    },
  };

  for (const table of tables) {
    tableEntries[table.fileName] = normalizeBytes(table.bytes);
  }

  return {
    bytes: zipSync(archiveEntries),
    fileName: `${directory}.zip`,
    mimeType: zipMimeType,
  };
}

function buildOutputExportManifest(
  request: OutputExportRequest,
  relationships: RelationalRelationship[],
  tables: OutputExportTableArtifact[],
): OutputExportManifest {
  return {
    exportName: request.exportName,
    generatedAt: new Date().toISOString(),
    relationships,
    rootPath: request.config?.rootPath ?? request.rootPath,
    sourceMode: request.sourceMode,
    tables: tables.map((table) => ({
      fileName: table.fileName,
      headers: table.headers,
      idColumn: table.idColumn,
      parentIdColumn: table.parentIdColumn,
      parentTable: table.parentTable,
      rowCount: table.rowCount,
      sourcePath: table.sourcePath,
      tableName: table.tableName,
    })),
  };
}

function createTextArtifact(
  fileName: string,
  content: string,
  mimeType: string,
): OutputExportArtifact {
  return {
    bytes: normalizeBytes(strToU8(content)),
    fileName,
    mimeType,
  };
}

function normalizeBytes(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

function resolveExportInput(request: ProjectionRequest): JsonValue {
  if (request.sourceMode === "sample") {
    return request.sampleJson;
  }

  const parsed = parseJsonInput(request.customJson);

  if (parsed.value === undefined) {
    throw new Error(parsed.error ?? "Invalid JSON input.");
  }

  return parsed.value;
}

function createRelationalTableFileName(exportBaseName: string, tableName: string) {
  return `${exportBaseName}--${sanitizeExportSegment(tableName, "table")}.csv`;
}

function sanitizeExportSegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export const outputExportMimeTypes = {
  csv: csvMimeType,
  json: jsonMimeType,
  zip: zipMimeType,
} as const;

export function createOutputExportRequest(options: {
  config?: MappingConfig;
  customJson: string;
  exportName: string;
  rootPath: string;
  sampleJson: JsonValue;
  sourceMode: ProjectionRequest["sourceMode"];
}): OutputExportRequest {
  return {
    config: options.config,
    customJson: options.customJson,
    exportName: options.exportName,
    rootPath: options.rootPath,
    sampleJson: options.sampleJson,
    sourceMode: options.sourceMode,
  };
}
