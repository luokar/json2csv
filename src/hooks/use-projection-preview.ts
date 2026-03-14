import { useEffect, useRef, useState } from 'react'
import {
  computeProjectionPayload,
  type ProjectionPayload,
  type ProjectionRequest,
  type ProjectionWorkerResponse,
} from '@/lib/projection'

interface ProjectionState extends ProjectionPayload {
  isProjecting: boolean
}

const emptyProjectionState: ProjectionState = {
  conversionResult: null,
  discoveredPaths: [],
  isProjecting: true,
  parseError: null,
}

export function useProjectionPreview(
  request: ProjectionRequest,
  configVersion: string,
) {
  const [projection, setProjection] = useState<ProjectionState>(() =>
    typeof Worker === 'undefined'
      ? {
          ...computeProjectionPayload(request),
          isProjecting: false,
        }
      : emptyProjectionState,
  )
  const configRef = useRef(request.config)
  const requestIdRef = useRef(0)
  const workerRef = useRef<Worker | null>(null)

  configRef.current = request.config

  const { customJson, rootPath, sampleJson, sourceMode } = request

  useEffect(() => {
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

    setProjection((previous) =>
      previous.isProjecting
        ? previous
        : {
            ...previous,
            isProjecting: true,
          },
    )

    const commitResult = (response: ProjectionWorkerResponse) => {
      if (response.requestId !== requestIdRef.current) {
        return
      }

      setProjection({
        ...response.payload,
        isProjecting: false,
      })
    }

    if (typeof Worker === 'undefined') {
      commitResult({
        payload: computeProjectionPayload(payload),
        requestId,
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
      commitResult(event.data)
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage({ payload, requestId })

    return () => {
      worker.removeEventListener('message', handleMessage)
    }
  }, [configVersion, customJson, rootPath, sampleJson, sourceMode])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  return projection
}
