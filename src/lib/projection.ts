import { parseJsonInput } from "@/lib/json-input";
import {
  resolveStreamableJsonPath,
  type StreamableJsonPath,
  streamJsonPath,
} from "@/lib/json-root-stream";
import {
  convertJsonToCsvPreviewTable,
  createMappingProjectionSession,
  type InspectedPath,
  inspectMappingPaths,
  type JsonValue,
  type MappingConfig,
  type MappingPreviewResult,
  type MappingResult,
  type MappingSchema,
  type MappingStreamChunk,
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
    };
  }

  const discoveredPaths = inspectMappingPaths(resolvedInput.value, request.rootPath, (progress) => {
    reportProgress("inspect", progress.completed, progress.total);
  });
  const conversionResult = request.config
    ? convertJsonToCsvPreviewTable(
        resolvedInput.value,
        request.config,
        {
          csvPreviewCharacterLimit: projectionFlatCsvPreviewCharacterLimit,
          previewRowLimit: projectionFlatRowPreviewLimit,
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
  });
}

const projectionStreamPreviewRowLimit = projectionFlatRowPreviewLimit;
const projectionStreamPreviewWarmupRootCount = 3;
const projectionStreamPreviewWarmupInterval = 8;
const projectionStreamPreviewSteadyInterval = 128;

const projectionPhaseLabels: Record<ProjectionPhase, string> = {
  flat: "Projecting flat CSV rows",
  inspect: "Inspecting root paths",
  parse: "Parsing JSON",
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
  const rootNodes: JsonValue[] = [];
  const flatProjectionSession = request.config
    ? createMappingProjectionSession(request.config)
    : null;

  try {
    streamJsonPath(request.customJson, streamableSelector, {
      onProgress: (progress) => {
        reportProgress("parse", progress.processedCharacters, progress.totalCharacters);
      },
      onRoot: (value) => {
        rootNodes.push(value);
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
    };
  }

  if (flatProjectionSession && handlers.onFlatStreamPreview) {
    handlers.onFlatStreamPreview(
      flatProjectionSession.buildStreamChunk(
        rootNodes.length,
        projectionStreamPreviewRowLimit,
        projectionFlatCsvPreviewCharacterLimit,
      ),
    );
  }

  reportProgress("parse", request.customJson.length, request.customJson.length);

  const discoveredPaths = inspectMappingPaths(rootNodes, undefined, (progress) => {
    reportProgress("inspect", progress.completed, progress.total);
  });
  const conversionResult = request.config
    ? finalizeFlatProjectionSession(flatProjectionSession, reportProgress)
    : null;

  return {
    conversionResult,
    discoveredPaths,
    parseError: null,
  };
}

function compactProjectionPayload(payload: {
  conversionResult: MappingPreviewResult | MappingResult | null;
  discoveredPaths: InspectedPath[];
  parseError: string | null;
}): ProjectionPayload {
  return {
    conversionResult: payload.conversionResult
      ? compactProjectionResult(payload.conversionResult)
      : null,
    discoveredPaths: payload.discoveredPaths,
    parseError: payload.parseError,
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
