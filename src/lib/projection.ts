import { parseJsonInput } from '@/lib/json-input'
import {
  resolveStreamableJsonPath,
  type StreamableJsonPath,
  streamJsonPath,
} from '@/lib/json-root-stream'
import {
  convertJsonToCsvTable,
  createMappingProjectionSession,
  type InspectedPath,
  inspectMappingPaths,
  type JsonValue,
  type MappingConfig,
  type MappingResult,
  type MappingSchema,
  type MappingStreamChunk,
} from '@/lib/mapping-engine'
import { createTextPreview, type TextPreview } from '@/lib/preview'
import {
  type RelationalRelationship,
  type RelationalSplitResult,
  type RelationalTable,
  splitJsonToRelationalTables,
} from '@/lib/relational-split'

export const projectionPhases = [
  'parse',
  'inspect',
  'flat',
  'relational',
] as const

export type ProjectionPhase = (typeof projectionPhases)[number]

export interface ProjectionProgress {
  label: string
  percent: number
  phase: ProjectionPhase
  phaseCompleted: number
  phaseTotal: number
}

export interface ProjectionRequest {
  config?: MappingConfig
  customJson: string
  includeRelational?: boolean
  rootPath: string
  sampleJson: JsonValue
  sourceMode: 'custom' | 'sample'
}

export interface ProjectionConversionResult {
  config: MappingConfig
  csvPreview: TextPreview
  headers: string[]
  records: Array<Record<string, string>>
  rowCount: number
  schema: MappingSchema
}

export interface ProjectionRelationalTable {
  csvPreview: TextPreview
  headers: string[]
  idColumn: string
  parentIdColumn: string | null
  parentTable: string | null
  records: Array<Record<string, string>>
  rowCount: number
  sourcePath: string
  tableName: string
}

export interface ProjectionRelationalSplitResult {
  relationships: RelationalRelationship[]
  tables: ProjectionRelationalTable[]
}

export interface ProjectionPayload {
  conversionResult: ProjectionConversionResult | null
  discoveredPaths: InspectedPath[]
  parseError: string | null
  relationalSplitResult: ProjectionRelationalSplitResult | null
}

export interface ProjectionRelationalPayload {
  parseError: string | null
  relationalSplitResult: ProjectionRelationalSplitResult | null
}

export interface ProjectionFlatStreamPreview extends MappingStreamChunk {}

export interface ProjectionWorkerRequest {
  payload: ProjectionRequest
  requestId: number
}

export interface ProjectionWorkerProgressResponse {
  progress: ProjectionProgress
  requestId: number
  type: 'progress'
}

export interface ProjectionWorkerStreamResponse {
  preview: ProjectionFlatStreamPreview
  requestId: number
  type: 'stream'
}

export interface ProjectionWorkerResultResponse {
  payload: ProjectionPayload
  requestId: number
  type: 'result'
}

export interface ProjectionRelationalWorkerRequest {
  payload: ProjectionRequest
  requestId: number
}

export interface ProjectionRelationalWorkerProgressResponse {
  progress: ProjectionProgress
  requestId: number
  type: 'progress'
}

export interface ProjectionRelationalWorkerResultResponse {
  payload: ProjectionRelationalPayload
  requestId: number
  type: 'result'
}

export type ProjectionWorkerResponse =
  | ProjectionWorkerProgressResponse
  | ProjectionWorkerStreamResponse
  | ProjectionWorkerResultResponse

export type ProjectionRelationalWorkerResponse =
  | ProjectionRelationalWorkerProgressResponse
  | ProjectionRelationalWorkerResultResponse

export function computeProjectionPayload(
  request: ProjectionRequest,
  onProgress?: (progress: ProjectionProgress) => void,
): ProjectionPayload {
  return streamProjectionPayload(request, { onProgress })
}

export function computeRelationalProjectionPayload(
  request: ProjectionRequest,
  onProgress?: (progress: ProjectionProgress) => void,
): ProjectionRelationalPayload {
  const reportProgress = createProjectionProgressReporter(onProgress)

  reportProgress('parse', 0, 1)

  const resolvedInput = resolveProjectionInput(request)

  reportProgress('parse', 1, 1)

  if (resolvedInput.value === undefined) {
    return {
      parseError: resolvedInput.error ?? 'Invalid JSON input.',
      relationalSplitResult: null,
    }
  }

  if (!request.config) {
    return {
      parseError: resolvedInput.error ?? null,
      relationalSplitResult: null,
    }
  }

  return {
    parseError: resolvedInput.error ?? null,
    relationalSplitResult: compactRelationalSplitResult(
      splitJsonToRelationalTables(
        resolvedInput.value,
        request.config,
        (progress) => {
          reportProgress('relational', progress.completed, progress.total)
        },
      ),
    ),
  }
}

export const projectionFlatRowPreviewLimit = 100
export const projectionFlatCsvPreviewCharacterLimit = 18_000
export const projectionRelationalRowPreviewLimit = 12
export const projectionRelationalCsvPreviewCharacterLimit = 12_000

export function streamProjectionPayload(
  request: ProjectionRequest,
  handlers: {
    onFlatStreamPreview?: (preview: ProjectionFlatStreamPreview) => void
    onProgress?: (progress: ProjectionProgress) => void
  } = {},
): ProjectionPayload {
  const reportProgress = createProjectionProgressReporter(handlers.onProgress)

  reportProgress('parse', 0, 1)

  const streamableSelector =
    request.sourceMode === 'custom'
      ? resolveStreamableJsonPath(request.rootPath)
      : null

  if (streamableSelector) {
    return compactProjectionPayload(
      streamCustomSelectorProjectionPayload(
        request,
        streamableSelector,
        handlers,
        reportProgress,
      ),
    )
  }

  const resolvedInput = resolveProjectionInput(request)

  reportProgress('parse', 1, 1)

  if (resolvedInput.value === undefined) {
    return {
      conversionResult: null,
      discoveredPaths: [],
      parseError: resolvedInput.error ?? 'Invalid JSON input.',
      relationalSplitResult: null,
    }
  }

  const discoveredPaths = inspectMappingPaths(
    resolvedInput.value,
    request.rootPath,
    (progress) => {
      reportProgress('inspect', progress.completed, progress.total)
    },
  )
  const conversionResult = request.config
    ? convertJsonToCsvTable(resolvedInput.value, request.config, {
        onProgress: (progress) => {
          reportProgress('flat', progress.completed, progress.total)
        },
        onStreamChunk: handlers.onFlatStreamPreview,
        streamPreviewRowLimit: projectionStreamPreviewRowLimit,
      })
    : null
  const relationalSplitResult =
    request.config && shouldIncludeRelationalProjection(request)
      ? splitJsonToRelationalTables(
          resolvedInput.value,
          request.config,
          (progress) => {
            reportProgress('relational', progress.completed, progress.total)
          },
        )
      : null

  return compactProjectionPayload({
    conversionResult,
    discoveredPaths,
    parseError: resolvedInput.error ?? null,
    relationalSplitResult,
  })
}

const projectionStreamPreviewRowLimit = projectionFlatRowPreviewLimit
const projectionStreamPreviewWarmupRootCount = 3
const projectionStreamPreviewWarmupInterval = 8
const projectionStreamPreviewSteadyInterval = 128

const projectionPhaseLabels: Record<ProjectionPhase, string> = {
  flat: 'Projecting flat CSV rows',
  inspect: 'Inspecting root paths',
  parse: 'Parsing JSON',
  relational: 'Normalizing relational tables',
}

const projectionPhaseOffsets: Record<ProjectionPhase, number> = {
  flat: 25,
  inspect: 10,
  parse: 0,
  relational: 65,
}

const projectionPhaseWeights: Record<ProjectionPhase, number> = {
  flat: 40,
  inspect: 15,
  parse: 10,
  relational: 35,
}

export function createInitialProjectionProgress(): ProjectionProgress {
  return buildProjectionProgress('parse', 0, 1)
}

function streamCustomSelectorProjectionPayload(
  request: ProjectionRequest,
  streamableSelector: StreamableJsonPath,
  handlers: {
    onFlatStreamPreview?: (preview: ProjectionFlatStreamPreview) => void
    onProgress?: (progress: ProjectionProgress) => void
  },
  reportProgress: (
    phase: ProjectionPhase,
    phaseCompleted: number,
    phaseTotal: number,
  ) => void,
) {
  const rootNodes: JsonValue[] = []
  const flatProjectionSession = request.config
    ? createMappingProjectionSession(request.config)
    : null

  try {
    streamJsonPath(request.customJson, streamableSelector, {
      onProgress: (progress) => {
        reportProgress(
          'parse',
          progress.processedCharacters,
          progress.totalCharacters,
        )
      },
      onRoot: (value) => {
        rootNodes.push(value)
        flatProjectionSession?.appendRoot(value)

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
            ),
          )
        }
      },
    })
  } catch (error) {
    return {
      conversionResult: null,
      discoveredPaths: [],
      parseError:
        error instanceof Error ? error.message : 'Invalid JSON input.',
      relationalSplitResult: null,
    }
  }

  if (flatProjectionSession && handlers.onFlatStreamPreview) {
    handlers.onFlatStreamPreview(
      flatProjectionSession.buildStreamChunk(
        rootNodes.length,
        projectionStreamPreviewRowLimit,
      ),
    )
  }

  reportProgress('parse', request.customJson.length, request.customJson.length)

  const discoveredPaths = inspectMappingPaths(
    rootNodes,
    undefined,
    (progress) => {
      reportProgress('inspect', progress.completed, progress.total)
    },
  )
  const conversionResult = request.config
    ? finalizeFlatProjectionSession(flatProjectionSession, reportProgress)
    : null
  const relationalSplitResult =
    request.config && shouldIncludeRelationalProjection(request)
      ? splitJsonToRelationalTables(
          rootNodes,
          {
            ...request.config,
            rootPath: undefined,
          },
          (progress) => {
            reportProgress('relational', progress.completed, progress.total)
          },
        )
      : null

  return {
    conversionResult,
    discoveredPaths,
    parseError: null,
    relationalSplitResult,
  }
}

function compactProjectionPayload(payload: {
  conversionResult: MappingResult | null
  discoveredPaths: InspectedPath[]
  parseError: string | null
  relationalSplitResult: RelationalSplitResult | null
}): ProjectionPayload {
  return {
    conversionResult: payload.conversionResult
      ? compactProjectionResult(payload.conversionResult)
      : null,
    discoveredPaths: payload.discoveredPaths,
    parseError: payload.parseError,
    relationalSplitResult: payload.relationalSplitResult
      ? compactRelationalSplitResult(payload.relationalSplitResult)
      : null,
  }
}

function compactProjectionResult(
  result: MappingResult,
): ProjectionConversionResult {
  return {
    config: result.config,
    csvPreview: createTextPreview(
      result.csv,
      projectionFlatCsvPreviewCharacterLimit,
    ),
    headers: result.headers,
    records: result.records.slice(0, projectionFlatRowPreviewLimit),
    rowCount: result.rowCount,
    schema: result.schema,
  }
}

function compactRelationalSplitResult(
  result: RelationalSplitResult,
): ProjectionRelationalSplitResult {
  return {
    relationships: result.relationships,
    tables: result.tables.map(compactRelationalTable),
  }
}

function compactRelationalTable(
  table: RelationalTable,
): ProjectionRelationalTable {
  return {
    csvPreview: createTextPreview(
      table.csv,
      projectionRelationalCsvPreviewCharacterLimit,
    ),
    headers: table.headers,
    idColumn: table.idColumn,
    parentIdColumn: table.parentIdColumn,
    parentTable: table.parentTable,
    records: table.records.slice(0, projectionRelationalRowPreviewLimit),
    rowCount: table.rowCount,
    sourcePath: table.sourcePath,
    tableName: table.tableName,
  }
}

function finalizeFlatProjectionSession(
  session: ReturnType<typeof createMappingProjectionSession> | null,
  reportProgress: (
    phase: ProjectionPhase,
    phaseCompleted: number,
    phaseTotal: number,
  ) => void,
) {
  if (!session) {
    return null
  }

  reportProgress('flat', 0, 1)
  const result = session.finalize()
  reportProgress('flat', 1, 1)

  return result
}

function resolveProjectionInput(request: ProjectionRequest) {
  return request.sourceMode === 'custom'
    ? parseJsonInput(request.customJson)
    : { error: null, value: request.sampleJson }
}

function shouldIncludeRelationalProjection(request: ProjectionRequest) {
  return request.includeRelational !== false
}

function shouldEmitProjectionStreamPreview(
  processedRoots: number,
  previewRowCount: number,
  previewRowLimit: number,
) {
  if (processedRoots <= projectionStreamPreviewWarmupRootCount) {
    return true
  }

  const chunkInterval =
    previewRowCount >= previewRowLimit
      ? projectionStreamPreviewSteadyInterval
      : projectionStreamPreviewWarmupInterval

  return processedRoots % chunkInterval === 0
}

function createProjectionProgressReporter(
  onProgress?: (progress: ProjectionProgress) => void,
) {
  let previousProgressKey = ''

  return (
    phase: ProjectionPhase,
    phaseCompleted: number,
    phaseTotal: number,
  ) => {
    if (!onProgress) {
      return
    }

    const progress = buildProjectionProgress(phase, phaseCompleted, phaseTotal)
    const progressKey = `${progress.phase}:${progress.percent}`

    if (progressKey === previousProgressKey && progress.percent < 100) {
      return
    }

    previousProgressKey = progressKey
    onProgress(progress)
  }
}

function buildProjectionProgress(
  phase: ProjectionPhase,
  phaseCompleted: number,
  phaseTotal: number,
): ProjectionProgress {
  const safeTotal = Math.max(phaseTotal, 1)
  const safeCompleted = Math.min(Math.max(phaseCompleted, 0), safeTotal)
  const percent = Math.round(
    projectionPhaseOffsets[phase] +
      projectionPhaseWeights[phase] * (safeCompleted / safeTotal),
  )

  return {
    label: projectionPhaseLabels[phase],
    percent,
    phase,
    phaseCompleted: safeCompleted,
    phaseTotal: safeTotal,
  }
}
