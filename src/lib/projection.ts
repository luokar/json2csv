import { parseJsonInput } from "@/lib/json-input";
import {
  resolveStreamableJsonPath,
  type StreamableJsonPath,
  streamJsonPath,
} from "@/lib/json-root-stream";
import {
  convertJsonToCsvPreviewTable,
  createMappingProjectionSession,
  createPathInspectionRegistry,
  finalizeInspectedPaths,
  type InspectedPath,
  inspectMappingPaths,
  inspectRootNodePaths,
  type JsonValue,
  type MappingConfig,
  type MappingPreviewResult,
  type MappingResult,
  type MappingSchema,
  type MappingStreamChunk,
  selectRootNodes,
} from "@/lib/mapping-engine";
import { createTextPreview, type TextPreview } from "@/lib/preview";

export const projectionPhases = ["parse", "inspect", "flat"] as const;

export type ProjectionPhase = (typeof projectionPhases)[number];

export interface ProjectionProgress {
  label: string;
  percent: number;
  phase: ProjectionPhase;
  phaseCompleted: number;
  phaseTotal: number;
}

export interface ProjectionRequest {
  config?: MappingConfig;
  customJson: string;
  rootPath: string;
  sampleJson: JsonValue;
  sourceMode: "custom" | "sample";
}

export interface ProjectionConversionResult {
  config: MappingConfig;
  csvPreview: TextPreview;
  headers: string[];
  records: Array<Record<string, string>>;
  rowCount: number;
  schema: MappingSchema;
}

export interface ProjectionPayload {
  conversionResult: ProjectionConversionResult | null;
  discoveredPaths: InspectedPath[];
  parseError: string | null;
  previewCapped: boolean;
  previewRootLimit: number | null;
}

export interface ProjectionFlatStreamPreview extends MappingStreamChunk {}

export interface ProjectionWorkerRequest {
  payload: ProjectionRequest;
  requestId: number;
}

export interface ProjectionWorkerProgressResponse {
  progress: ProjectionProgress;
  requestId: number;
  type: "progress";
}

export interface ProjectionWorkerStreamResponse {
  preview: ProjectionFlatStreamPreview;
  requestId: number;
  type: "stream";
}

export interface ProjectionWorkerResultResponse {
  payload: ProjectionPayload;
  requestId: number;
  type: "result";
}

export type ProjectionWorkerResponse =
  | ProjectionWorkerProgressResponse
  | ProjectionWorkerStreamResponse
  | ProjectionWorkerResultResponse;

export function computeProjectionPayload(
  request: ProjectionRequest,
  onProgress?: (progress: ProjectionProgress) => void,
): ProjectionPayload {
  return streamProjectionPayload(request, { onProgress });
}

export const projectionFlatRowPreviewLimit = 100;
export const projectionFlatCsvPreviewCharacterLimit = 18_000;
export const projectionDiscoveredPathLimit = 2_500;
export const projectionPreviewRootLimit = 1_500;
export const projectionRenderedRowBudget = 2_000;

export function streamProjectionPayload(
  request: ProjectionRequest,
  handlers: {
    onFlatStreamPreview?: (preview: ProjectionFlatStreamPreview) => void;
    onProgress?: (progress: ProjectionProgress) => void;
  } = {},
): ProjectionPayload {
  const reportProgress = createProjectionProgressReporter(handlers.onProgress);

  reportProgress("parse", 0, 1);

  const streamableSelector =
    request.sourceMode === "custom" ? resolveStreamableJsonPath(request.rootPath) : null;

  if (streamableSelector) {
    return compactProjectionPayload(
      streamCustomSelectorProjectionPayload(request, streamableSelector, handlers, reportProgress),
    );
  }

  const resolvedInput = resolveProjectionInput(request);

  reportProgress("parse", 1, 1);

  if (resolvedInput.value === undefined) {
    return {
      conversionResult: null,
      discoveredPaths: [],
      parseError: resolvedInput.error ?? "Invalid JSON input.",
      previewCapped: false,
      previewRootLimit: null,
    };
  }

  const selectedRootCount = selectRootNodes(
    resolvedInput.value,
    request.rootPath,
    projectionPreviewRootLimit + 1,
  ).length;
  const previewRootLimit = resolveProjectionPreviewRootLimit(request, selectedRootCount);
  const previewCapped = previewRootLimit !== null && selectedRootCount > previewRootLimit;

  const discoveredPaths = inspectMappingPaths(
    resolvedInput.value,
    request.rootPath,
    (progress) => {
      reportProgress("inspect", progress.completed, progress.total);
    },
    previewRootLimit ?? undefined,
    projectionDiscoveredPathLimit,
  );
  const conversionResult = request.config
    ? convertJsonToCsvPreviewTable(
        resolvedInput.value,
        request.config,
        {
          csvPreviewCharacterLimit: projectionFlatCsvPreviewCharacterLimit,
          previewRowLimit: projectionFlatRowPreviewLimit,
          renderedRowBudget: projectionRenderedRowBudget,
          rootLimit: previewRootLimit ?? undefined,
        },
        {
          onProgress: (progress) => {
            reportProgress("flat", progress.completed, progress.total);
          },
          onStreamChunk: handlers.onFlatStreamPreview,
          streamPreviewCharacterLimit: projectionFlatCsvPreviewCharacterLimit,
          streamPreviewRowLimit: projectionStreamPreviewRowLimit,
        },
      )
    : null;
  return compactProjectionPayload({
    conversionResult,
    discoveredPaths,
    parseError: resolvedInput.error ?? null,
    previewCapped,
    previewRootLimit: previewCapped ? previewRootLimit : null,
  });
}

const projectionStreamPreviewRowLimit = projectionFlatRowPreviewLimit;
const projectionStreamPreviewWarmupRootCount = 3;
const projectionStreamPreviewWarmupInterval = 8;
const projectionStreamPreviewSteadyInterval = 128;
const projectionDynamicBudgetSampleSize = 10;

const projectionPhaseLabels: Record<ProjectionPhase, string> = {
  flat: "Building spreadsheet rows",
  inspect: "Scanning data structure",
  parse: "Reading JSON",
};

const projectionPhaseOffsets: Record<ProjectionPhase, number> = {
  flat: 25,
  inspect: 10,
  parse: 0,
};

const projectionPhaseWeights: Record<ProjectionPhase, number> = {
  flat: 75,
  inspect: 15,
  parse: 10,
};

export function createInitialProjectionProgress(): ProjectionProgress {
  return buildProjectionProgress("parse", 0, 1);
}

function streamCustomSelectorProjectionPayload(
  request: ProjectionRequest,
  streamableSelector: StreamableJsonPath,
  handlers: {
    onFlatStreamPreview?: (preview: ProjectionFlatStreamPreview) => void;
    onProgress?: (progress: ProjectionProgress) => void;
  },
  reportProgress: (phase: ProjectionPhase, phaseCompleted: number, phaseTotal: number) => void,
) {
  const pathRegistry = createPathInspectionRegistry();
  let effectiveRootLimit = projectionPreviewRootLimit;
  const flatProjectionSession = request.config
    ? createMappingProjectionSession(request.config, {
        renderedRowBudget: projectionRenderedRowBudget,
      })
    : null;
  let totalParsedRootCount = 0;

  try {
    streamJsonPath(request.customJson, streamableSelector, {
      onProgress: (progress) => {
        reportProgress("parse", progress.processedCharacters, progress.totalCharacters);
      },
      onRoot: (value) => {
        totalParsedRootCount += 1;

        if (totalParsedRootCount > effectiveRootLimit) {
          return;
        }

        // After processing a sample of roots, check row expansion ratio
        // and reduce the root limit if each root produces many rows.
        if (flatProjectionSession && totalParsedRootCount === projectionDynamicBudgetSampleSize) {
          effectiveRootLimit = resolveDynamicRootLimit(
            flatProjectionSession.getRenderedRowCount(),
            totalParsedRootCount,
            effectiveRootLimit,
          );
        }

        inspectRootNodePaths(value, pathRegistry, projectionDiscoveredPathLimit);
        flatProjectionSession?.appendRoot(value);

        if (
          flatProjectionSession &&
          handlers.onFlatStreamPreview &&
          shouldEmitProjectionStreamPreview(
            flatProjectionSession.getProcessedRoots(),
            flatProjectionSession.getRenderedRowCount(),
            projectionStreamPreviewRowLimit,
          )
        ) {
          handlers.onFlatStreamPreview(
            flatProjectionSession.buildStreamChunk(
              null,
              projectionStreamPreviewRowLimit,
              projectionFlatCsvPreviewCharacterLimit,
            ),
          );
        }
      },
    });
  } catch (error) {
    return {
      conversionResult: null,
      discoveredPaths: [],
      parseError: error instanceof Error ? error.message : "Invalid JSON input.",
      previewCapped: false,
      previewRootLimit: null,
    };
  }

  if (flatProjectionSession && handlers.onFlatStreamPreview) {
    handlers.onFlatStreamPreview(
      flatProjectionSession.buildStreamChunk(
        totalParsedRootCount,
        projectionStreamPreviewRowLimit,
        projectionFlatCsvPreviewCharacterLimit,
      ),
    );
  }

  reportProgress("parse", request.customJson.length, request.customJson.length);

  const discoveredPaths = finalizeInspectedPaths(pathRegistry);
  const conversionResult = request.config
    ? finalizeFlatProjectionSession(flatProjectionSession, reportProgress)
    : null;
  const previewCapped = totalParsedRootCount > effectiveRootLimit;

  return {
    conversionResult,
    discoveredPaths,
    parseError: null,
    previewCapped,
    previewRootLimit: previewCapped ? effectiveRootLimit : null,
  };
}

function compactProjectionPayload(payload: {
  conversionResult: MappingPreviewResult | MappingResult | null;
  discoveredPaths: InspectedPath[];
  parseError: string | null;
  previewCapped: boolean;
  previewRootLimit: number | null;
}): ProjectionPayload {
  return {
    conversionResult: payload.conversionResult
      ? compactProjectionResult(payload.conversionResult)
      : null,
    discoveredPaths: payload.discoveredPaths,
    parseError: payload.parseError,
    previewCapped: payload.previewCapped,
    previewRootLimit: payload.previewRootLimit,
  };
}

function compactProjectionResult(
  result: MappingPreviewResult | MappingResult,
): ProjectionConversionResult {
  if ("csvPreview" in result) {
    return result;
  }

  return {
    config: result.config,
    csvPreview: createTextPreview(result.csv, projectionFlatCsvPreviewCharacterLimit),
    headers: result.headers,
    records: result.records.slice(0, projectionFlatRowPreviewLimit),
    rowCount: result.rowCount,
    schema: result.schema,
  };
}

function finalizeFlatProjectionSession(
  session: ReturnType<typeof createMappingProjectionSession> | null,
  reportProgress: (phase: ProjectionPhase, phaseCompleted: number, phaseTotal: number) => void,
) {
  if (!session) {
    return null;
  }

  reportProgress("flat", 0, 1);
  const result = session.finalizePreview({
    csvPreviewCharacterLimit: projectionFlatCsvPreviewCharacterLimit,
    previewRowLimit: projectionFlatRowPreviewLimit,
  });
  reportProgress("flat", 1, 1);

  return result;
}

function resolveProjectionInput(request: ProjectionRequest) {
  return request.sourceMode === "custom"
    ? parseJsonInput(request.customJson)
    : { error: null, value: request.sampleJson };
}

function resolveProjectionPreviewRootLimit(
  _request: ProjectionRequest,
  selectedRootCount?: number,
) {
  if (selectedRootCount !== undefined && selectedRootCount > projectionPreviewRootLimit) {
    return projectionPreviewRootLimit;
  }

  return null;
}

function resolveDynamicRootLimit(
  renderedRowCount: number,
  processedRoots: number,
  currentLimit: number,
) {
  if (processedRoots === 0) {
    return currentLimit;
  }

  const rowsPerRoot = renderedRowCount / processedRoots;

  // For high-expansion data (many rows per root), reduce the root limit
  // to keep total rendered rows within the budget.
  if (rowsPerRoot > 10) {
    return Math.min(
      currentLimit,
      Math.max(
        Math.floor(projectionRenderedRowBudget / rowsPerRoot),
        projectionDynamicBudgetSampleSize,
      ),
    );
  }

  return currentLimit;
}

function shouldEmitProjectionStreamPreview(
  processedRoots: number,
  previewRowCount: number,
  previewRowLimit: number,
) {
  if (processedRoots <= projectionStreamPreviewWarmupRootCount) {
    return true;
  }

  const chunkInterval =
    previewRowCount >= previewRowLimit
      ? projectionStreamPreviewSteadyInterval
      : projectionStreamPreviewWarmupInterval;

  return processedRoots % chunkInterval === 0;
}

function createProjectionProgressReporter(onProgress?: (progress: ProjectionProgress) => void) {
  let previousProgressKey = "";

  return (phase: ProjectionPhase, phaseCompleted: number, phaseTotal: number) => {
    if (!onProgress) {
      return;
    }

    const progress = buildProjectionProgress(phase, phaseCompleted, phaseTotal);
    const progressKey = `${progress.phase}:${progress.percent}`;

    if (progressKey === previousProgressKey && progress.percent < 100) {
      return;
    }

    previousProgressKey = progressKey;
    onProgress(progress);
  };
}

function buildProjectionProgress(
  phase: ProjectionPhase,
  phaseCompleted: number,
  phaseTotal: number,
): ProjectionProgress {
  const safeTotal = Math.max(phaseTotal, 1);
  const safeCompleted = Math.min(Math.max(phaseCompleted, 0), safeTotal);
  const percent = Math.round(
    projectionPhaseOffsets[phase] + projectionPhaseWeights[phase] * (safeCompleted / safeTotal),
  );

  return {
    label: projectionPhaseLabels[phase],
    percent,
    phase,
    phaseCompleted: safeCompleted,
    phaseTotal: safeTotal,
  };
}
