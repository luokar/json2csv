/// <reference lib="webworker" />

import {
  computeRelationalProjectionPayload,
  type ProjectionProgress,
  type ProjectionRelationalWorkerRequest,
  type ProjectionRelationalWorkerResponse,
  type ProjectionRelationalWorkerResultResponse,
} from '@/lib/projection'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<ProjectionRelationalWorkerRequest>) => {
  const { payload, requestId } = event.data
  const progressCallback = (progress: ProjectionProgress) => {
    self.postMessage({
      progress,
      requestId,
      type: 'progress',
    } satisfies ProjectionRelationalWorkerResponse)
  }
  const response: ProjectionRelationalWorkerResultResponse = {
    payload: computeRelationalProjectionPayload(payload, progressCallback),
    requestId,
    type: 'result',
  }

  self.postMessage(response)
}
