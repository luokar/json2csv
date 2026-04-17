import { strToU8 } from "fflate";
import { parseJsonInput } from "@/lib/json-input";
import { convertJsonToCsvText, type JsonValue, type MappingConfig } from "@/lib/mapping-engine";
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

export type OutputExportWorkerResponse =
  | OutputExportWorkerErrorResponse
  | OutputExportWorkerResultResponse;

export function buildOutputExportArtifact(request: OutputExportRequest): OutputExportArtifact {
  if (!request.config) {
    throw new Error("Fix the settings errors before downloading.");
  }

  const input = resolveExportInput(request);
  const flatResult = convertJsonToCsvText(input, request.config);
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
