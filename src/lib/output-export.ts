import { strToU8 } from "fflate";
import { parseJsonInput } from "@/lib/json-input";
import { convertJsonToCsvText, createMappingConfig, type JsonValue, type MappingConfig, type ProcessingProgress, toCsv } from "@/lib/mapping-engine";
import type { ProjectionRequest } from "@/lib/projection";

const csvMimeType = "text/csv;charset=utf-8";
const defaultExportBaseName = "json2csv-export";

export interface OutputExportArtifact {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface OutputExportRequest extends ProjectionRequest {
  exportName: string;
}

export interface OutputExportWorkerRequest {
  payload: OutputExportRequest;
  requestId: number;
}

export interface OutputExportWorkerResultResponse {
  payload: OutputExportArtifact;
  requestId: number;
  type: "result";
}

export interface OutputExportWorkerErrorResponse {
  error: string;
  requestId: number;
  type: "error";
}

export interface OutputExportWorkerProgressResponse {
  progress: { completed: number; total: number };
  requestId: number;
  type: "progress";
}

export type OutputExportWorkerResponse =
  | OutputExportWorkerErrorResponse
  | OutputExportWorkerProgressResponse
  | OutputExportWorkerResultResponse;

export function buildOutputExportArtifact(
  request: OutputExportRequest,
  onProgress?: (progress: ProcessingProgress) => void,
): OutputExportArtifact {
  if (!request.config) {
    throw new Error("Fix the settings errors before downloading.");
  }

  const input = resolveExportInput(request);
  const flatResult = convertJsonToCsvText(input, request.config, onProgress);
  const exportBaseName = sanitizeExportSegment(request.exportName, defaultExportBaseName);

  return createTextArtifact(`${exportBaseName}.csv`, flatResult.csv, csvMimeType);
}

export function downloadExportArtifact(artifact: OutputExportArtifact) {
  if (typeof document === "undefined") {
    return;
  }

  const url = URL.createObjectURL(
    new Blob([artifact.bytes.buffer as ArrayBuffer], {
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

function createTextArtifact(
  fileName: string,
  content: string,
  mimeType: string,
): OutputExportArtifact {
  return {
    bytes: strToU8(content),
    fileName,
    mimeType,
  };
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
  json: "application/json",
} as const;

export function buildSelectedRowsExportArtifact(
  headers: string[],
  records: Array<Record<string, string>>,
  options: { delimiter: string; exportName: string; quoteAll: boolean },
): OutputExportArtifact {
  const config = createMappingConfig({ delimiter: options.delimiter, quoteAll: options.quoteAll });
  const csv = toCsv(headers, records, config);
  const exportBaseName = sanitizeExportSegment(options.exportName, defaultExportBaseName);
  return createTextArtifact(`${exportBaseName}-selected.csv`, csv, csvMimeType);
}

export function buildSelectedRowsJsonExportArtifact(
  records: Array<Record<string, string>>,
  options: { exportName: string },
): OutputExportArtifact {
  const json = JSON.stringify(records, null, 2);
  const exportBaseName = sanitizeExportSegment(options.exportName, defaultExportBaseName);
  return createTextArtifact(`${exportBaseName}-selected.json`, json, "application/json");
}

export function copyRowsToClipboard(
  headers: string[],
  records: Array<Record<string, string>>,
  format: "csv" | "json",
  config?: { delimiter?: string; quoteAll?: boolean },
): Promise<void> {
  const text =
    format === "json"
      ? JSON.stringify(records, null, 2)
      : toCsv(headers, records, createMappingConfig({ delimiter: config?.delimiter, quoteAll: config?.quoteAll }));
  return navigator.clipboard.writeText(text);
}

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
