/// <reference lib="webworker" />

import {
  computeProjectionPayload,
  type ProjectionWorkerRequest,
  type ProjectionWorkerResponse,
} from '@/lib/projection'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<ProjectionWorkerRequest>) => {
  const response: ProjectionWorkerResponse = {
    payload: computeProjectionPayload(event.data.payload),
    requestId: event.data.requestId,
  }

  self.postMessage(response)
}
