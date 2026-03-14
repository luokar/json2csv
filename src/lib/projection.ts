import { parseJsonInput } from '@/lib/json-input'
import {
  convertJsonToCsvTable,
  type InspectedPath,
  inspectMappingPaths,
  type JsonValue,
  type MappingConfig,
  type MappingResult,
} from '@/lib/mapping-engine'

export interface ProjectionRequest {
  config?: MappingConfig
  customJson: string
  rootPath: string
  sampleJson: JsonValue
  sourceMode: 'custom' | 'sample'
}

export interface ProjectionPayload {
  conversionResult: MappingResult | null
  discoveredPaths: InspectedPath[]
  parseError: string | null
}

export interface ProjectionWorkerRequest {
  payload: ProjectionRequest
  requestId: number
}

export interface ProjectionWorkerResponse {
  payload: ProjectionPayload
  requestId: number
}

export function computeProjectionPayload(
  request: ProjectionRequest,
): ProjectionPayload {
  const resolvedInput =
    request.sourceMode === 'custom'
      ? parseJsonInput(request.customJson)
      : { error: null, value: request.sampleJson }

  if (resolvedInput.value === undefined) {
    return {
      conversionResult: null,
      discoveredPaths: [],
      parseError: resolvedInput.error ?? 'Invalid JSON input.',
    }
  }

  return {
    conversionResult: request.config
      ? convertJsonToCsvTable(resolvedInput.value, request.config)
      : null,
    discoveredPaths: inspectMappingPaths(resolvedInput.value, request.rootPath),
    parseError: resolvedInput.error ?? null,
  }
}
