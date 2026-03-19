import { useEffect, useRef, useState } from 'react'
import {
  computeRelationalProjectionPayload,
  createInitialProjectionProgress,
  type ProjectionProgress,
  type ProjectionRelationalPayload,
  type ProjectionRelationalWorkerResponse,
  type ProjectionRequest,
} from '@/lib/projection'

interface RelationalProjectionState extends ProjectionRelationalPayload {
  isProjecting: boolean
  progress: ProjectionProgress | null
}

const emptyRelationalProjectionState: RelationalProjectionState = {
  isProjecting: true,
  parseError: null,
  progress: createInitialProjectionProgress(),
  relationalSplitResult: null,
}

const disabledRelationalProjectionState: RelationalProjectionState = {
  isProjecting: false,
  parseError: null,
  progress: null,
  relationalSplitResult: null,
}

export function useRelationalPreview(
  request: ProjectionRequest,
  configVersion: string,
  options: {
    enabled?: boolean
  } = {},
) {
  const enabled = options.enabled ?? true
  const [projection, setProjection] = useState<RelationalProjectionState>(() =>
    !enabled
      ? disabledRelationalProjectionState
      : typeof Worker === 'undefined'
        ? {
            ...computeRelationalProjectionPayload(request),
            isProjecting: false,
            progress: null,
          }
        : emptyRelationalProjectionState,
  )
  const configRef = useRef(request.config)
  const requestIdRef = useRef(0)
  const workerRef = useRef<Worker | null>(null)

  configRef.current = request.config

  const { customJson, includeRelational, rootPath, sampleJson, sourceMode } =
    request

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
      includeRelational,
      rootPath,
      sampleJson,
      sourceMode,
    }

    setProjection((previous) => ({
      ...previous,
      isProjecting: true,
      parseError: null,
      progress: createInitialProjectionProgress(),
      relationalSplitResult: null,
    }))

    const commitProgress = (response: ProjectionRelationalWorkerResponse) => {
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

    const commitResult = (response: ProjectionRelationalWorkerResponse) => {
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
      })
    }

    if (typeof Worker === 'undefined') {
      commitResult({
        payload: computeRelationalProjectionPayload(payload),
        requestId,
        type: 'result',
      })

      return
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/relational-worker.ts', import.meta.url),
        { type: 'module' },
      )
    }

    const worker = workerRef.current
    const handleMessage = (
      event: MessageEvent<ProjectionRelationalWorkerResponse>,
    ) => {
      commitProgress(event.data)
      commitResult(event.data)
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage({ payload, requestId })

    return () => {
      worker.removeEventListener('message', handleMessage)
    }
  }, [
    configVersion,
    customJson,
    enabled,
    includeRelational,
    rootPath,
    sampleJson,
    sourceMode,
  ])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  return enabled ? projection : disabledRelationalProjectionState
}
