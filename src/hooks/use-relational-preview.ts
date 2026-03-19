import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
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
  const pendingCommitRequestIdRef = useRef<number | null>(null)
  const pendingProjectionPatchRef =
    useRef<Partial<RelationalProjectionState> | null>(null)
  const scheduledAnimationFrameRef = useRef<number | null>(null)
  const requestIdRef = useRef(0)
  const scheduledTimeoutRef = useRef<number | null>(null)
  const workerRef = useRef<Worker | null>(null)

  configRef.current = request.config

  const { customJson, includeRelational, rootPath, sampleJson, sourceMode } =
    request

  const clearScheduledCommit = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      scheduledAnimationFrameRef.current !== null
    ) {
      window.cancelAnimationFrame(scheduledAnimationFrameRef.current)
      scheduledAnimationFrameRef.current = null
    }

    if (typeof window !== 'undefined' && scheduledTimeoutRef.current !== null) {
      window.clearTimeout(scheduledTimeoutRef.current)
      scheduledTimeoutRef.current = null
    }
  }, [])

  const clearPendingCommit = useCallback(() => {
    clearScheduledCommit()
    pendingCommitRequestIdRef.current = null
    pendingProjectionPatchRef.current = null
  }, [clearScheduledCommit])

  const flushPendingCommit = useCallback(() => {
    clearScheduledCommit()

    const pendingPatch = pendingProjectionPatchRef.current
    const pendingRequestId = pendingCommitRequestIdRef.current

    pendingProjectionPatchRef.current = null
    pendingCommitRequestIdRef.current = null

    if (!pendingPatch || pendingRequestId !== requestIdRef.current) {
      return
    }

    startTransition(() => {
      setProjection((previous) => ({
        ...previous,
        ...pendingPatch,
      }))
    })
  }, [clearScheduledCommit])

  const scheduleCommit = useCallback(
    (requestId: number, patch: Partial<RelationalProjectionState>) => {
      if (requestId !== requestIdRef.current) {
        return
      }

      pendingCommitRequestIdRef.current = requestId
      pendingProjectionPatchRef.current = {
        ...(pendingProjectionPatchRef.current ?? {}),
        ...patch,
      }

      if (
        scheduledAnimationFrameRef.current !== null ||
        scheduledTimeoutRef.current !== null
      ) {
        return
      }

      if (
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
      ) {
        scheduledAnimationFrameRef.current = window.requestAnimationFrame(
          () => {
            scheduledAnimationFrameRef.current = null
            flushPendingCommit()
          },
        )

        return
      }

      if (typeof window !== 'undefined') {
        scheduledTimeoutRef.current = window.setTimeout(() => {
          scheduledTimeoutRef.current = null
          flushPendingCommit()
        }, 16)

        return
      }

      flushPendingCommit()
    },
    [flushPendingCommit],
  )

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1
      clearPendingCommit()
      workerRef.current?.terminate()
      workerRef.current = null

      return
    }

    // `configVersion` is the dependency key for config changes while the
    // latest config value itself is read from `configRef`.
    void configVersion

    clearPendingCommit()
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

      scheduleCommit(requestId, {
        isProjecting: true,
        progress: response.progress,
      })
    }

    const commitResult = (response: ProjectionRelationalWorkerResponse) => {
      if (
        response.type !== 'result' ||
        response.requestId !== requestIdRef.current
      ) {
        return
      }

      clearPendingCommit()
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
    clearPendingCommit,
    configVersion,
    customJson,
    enabled,
    includeRelational,
    rootPath,
    sampleJson,
    scheduleCommit,
    sourceMode,
  ])

  useEffect(
    () => () => {
      clearPendingCommit()
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [clearPendingCommit],
  )

  return enabled ? projection : disabledRelationalProjectionState
}
