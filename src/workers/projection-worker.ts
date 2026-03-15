/// <reference lib="webworker" />

import {
  type ProjectionFlatStreamPreview,
  type ProjectionProgress,
  type ProjectionWorkerRequest,
  type ProjectionWorkerResponse,
  type ProjectionWorkerResultResponse,
  streamProjectionPayload,
} from '@/lib/projection'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<ProjectionWorkerRequest>) => {
  const { payload, requestId } = event.data
  const progressCallback = (progress: ProjectionProgress) => {
    self.postMessage({
      progress,
      requestId,
      type: 'progress',
    } satisfies ProjectionWorkerResponse)
  }
  const streamCallback = (preview: ProjectionFlatStreamPreview) => {
    self.postMessage({
      preview,
      requestId,
      type: 'stream',
    } satisfies ProjectionWorkerResponse)
  }
  const response: ProjectionWorkerResultResponse = {
    payload: streamProjectionPayload(payload, {
      onFlatStreamPreview: streamCallback,
      onProgress: progressCallback,
    }),
    requestId,
    type: 'result',
  }

  self.postMessage(response)
}
