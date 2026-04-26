import type { ProjectionFlatStreamPreview, ProjectionProgress } from "@/lib/projection";
import type { MappingConfig } from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import {
  exportNameMaxLength,
  largeObjectRootPreviewSuspendCharacterThreshold,
} from "@/lib/workbench-constants";

export type SourceMode = "sample" | "custom";

/** Look up a sample mapping by id, falling back to the first registered sample. */
export function getSampleById(sampleId: string) {
  return mappingSamples.find((sample) => sample.id === sampleId) ?? mappingSamples[0];
}

/** Friendly label for the active source: sample title or "Your JSON". */
export function describeActiveSource(sourceMode: SourceMode, sampleTitle: string) {
  return sourceMode === "custom" ? "Your JSON" : sampleTitle;
}

/** Strip the trailing extension from an uploaded file name. */
export function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "Imported JSON";
}

/** Trim and clamp an export-name input to the configured max length. */
export function normalizeExportName(value: string) {
  return value.trim().slice(0, exportNameMaxLength);
}

/** One-line summary of a mapping config: flatten / header policy / delimiter. */
export function describeConfig(config: MappingConfig) {
  return `${toTitleCase(config.flattenMode)} / ${config.headerPolicy.replaceAll("_", " ")} / ${config.delimiter === "\t" ? "tab" : config.delimiter}`;
}

/** Caption shown while a streaming preview is still building. */
export function describeStreamingPreviewCaption(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Loading preview from ${preview.processedRoots} items. Still building the final result in the background.`
    : `Loading preview from ${preview.processedRoots}/${preview.totalRoots} items. Still building the final result in the background.`;
}

/** Notice rendered when the preview was capped by the safety-mode root limit. */
export function describePreviewLimitNotice(rootLimit: number) {
  return `Large-input safety mode is active. The preview is limited to the first ${rootLimit.toLocaleString()} items to save memory. The full CSV download still uses all your data.`;
}

/** Reason string shown when an oversized object-root preview is suspended, or null. */
export function describeLargeObjectRootPreviewSuspension(
  sourceMode: SourceMode,
  rootPath: string,
  customJson: string,
) {
  if (sourceMode !== "custom" || rootPath.trim() !== "$") {
    return null;
  }

  if (customJson.length < largeObjectRootPreviewSuspendCharacterThreshold) {
    return null;
  }

  if (!customJson.trimStart().startsWith("{")) {
    return null;
  }

  return `Preview is paused for large object-root JSON above ${largeObjectRootPreviewSuspendCharacterThreshold.toLocaleString()} characters. Choose a narrower data location to resume the preview.`;
}

/** Detail string for the projection progress line: counts and percent. */
export function formatProjectionProgressDetail(progress: ProjectionProgress) {
  if (progress.phase === "parse" && progress.phaseTotal > 1) {
    return `${progress.phaseCompleted.toLocaleString()}/${progress.phaseTotal.toLocaleString()} chars · ${progress.percent}%`;
  }

  if (progress.phaseTotal > 1) {
    return `${progress.phaseCompleted}/${progress.phaseTotal} items · ${progress.percent}%`;
  }

  return `${progress.percent}%`;
}

/** Title-case a snake_case or space-delimited identifier. */
export function toTitleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Stable id for a grid row, biased toward a preferred header value. */
export function createGridRowId(
  row: Record<string, string>,
  index: number,
  headers: string[],
  preferredHeader?: string,
) {
  const candidates = [preferredHeader, ...headers].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const value = row[candidate];

    if (value) {
      return `${candidate}:${value}:${index}`;
    }
  }

  return `row:${index}`;
}

/** Human label for a row, taking the first non-empty value of common id headers. */
export function createWorkbenchRowLabel(row: Record<string, string>, fallback: string) {
  const candidateHeaders = ["root_id", "id", "name", "type", ...Object.keys(row)];

  for (const header of candidateHeaders) {
    const value = row[header];

    if (value) {
      return value;
    }
  }

  return fallback;
}
