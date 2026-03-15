import { useEffect, useRef, useState } from 'react'
import {
  computeProjectionPayload,
  createInitialProjectionProgress,
  type ProjectionFlatStreamPreview,
  type ProjectionPayload,
  type ProjectionProgress,
  type ProjectionRequest,
  type ProjectionWorkerResponse,
} from '@/lib/projection'

interface ProjectionState extends ProjectionPayload {
  isProjecting: boolean
  progress: ProjectionProgress | null
  streamingFlatPreview: ProjectionFlatStreamPreview | null
}

const emptyProjectionState: ProjectionState = {
  conversionResult: null,
  discoveredPaths: [],
  isProjecting: true,
  parseError: null,
  progress: createInitialProjectionProgress(),
  relationalSplitResult: null,
  streamingFlatPreview: null,
}

const disabledProjectionState: ProjectionState = {
  conversionResult: null,
  discoveredPaths: [],
  isProjecting: false,
  parseError: null,
  progress: null,
  relationalSplitResult: null,
  streamingFlatPreview: null,
}

export function useProjectionPreview(
  request: ProjectionRequest,
  configVersion: string,
  options: {
    enabled?: boolean
  } = {},
) {
  const enabled = options.enabled ?? true
  const [projection, setProjection] = useState<ProjectionState>(() =>
    !enabled
      ? disabledProjectionState
      : typeof Worker === 'undefined'
        ? {
            ...computeProjectionPayload(request),
            isProjecting: false,
            progress: null,
            streamingFlatPreview: null,
          }
        : emptyProjectionState,
  )
  const configRef = useRef(request.config)
  const requestIdRef = useRef(0)
  const workerRef = useRef<Worker | null>(null)

  configRef.current = request.config

  const { customJson, rootPath, sampleJson, sourceMode } = request

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1
      workerRef.current?.terminate()
      workerRef.current = null

      return
    }

    // `configVersion` is the dependency key for config changes while the
    // latest config value itself is read from `configRef`.
    void configVersion

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const payload: ProjectionRequest = {
      config: configRef.current,
      customJson,
      rootPath,
      sampleJson,
      sourceMode,
    }

    setProjection((previous) => ({
      ...previous,
      isProjecting: true,
      progress: createInitialProjectionProgress(),
      streamingFlatPreview: null,
    }))

    const commitProgress = (response: ProjectionWorkerResponse) => {
      if (
        response.type !== 'progress' ||
        response.requestId !== requestIdRef.current
      ) {
        return
      }

      setProjection((previous) => ({
        ...previous,
        isProjecting: true,
        progress: response.progress,
      }))
    }

    const commitStreamPreview = (response: ProjectionWorkerResponse) => {
      if (
        response.type !== 'stream' ||
        response.requestId !== requestIdRef.current
      ) {
        return
      }

      setProjection((previous) => ({
        ...previous,
        isProjecting: true,
        streamingFlatPreview: response.preview,
      }))
    }

    const commitResult = (response: ProjectionWorkerResponse) => {
      if (
        response.type !== 'result' ||
        response.requestId !== requestIdRef.current
      ) {
        return
      }

      setProjection({
        ...response.payload,
        isProjecting: false,
        progress: null,
        streamingFlatPreview: null,
      })
    }

    if (typeof Worker === 'undefined') {
      commitResult({
        payload: computeProjectionPayload(payload),
        requestId,
        type: 'result',
      })

      return
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/projection-worker.ts', import.meta.url),
        { type: 'module' },
      )
    }

    const worker = workerRef.current
    const handleMessage = (event: MessageEvent<ProjectionWorkerResponse>) => {
      commitProgress(event.data)
      commitStreamPreview(event.data)
      commitResult(event.data)
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage({ payload, requestId })

    return () => {
      worker.removeEventListener('message', handleMessage)
    }
  }, [configVersion, customJson, enabled, rootPath, sampleJson, sourceMode])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  return enabled ? projection : disabledProjectionState
}
