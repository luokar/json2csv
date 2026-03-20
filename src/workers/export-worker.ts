/// <reference lib="webworker" />

import {
  buildOutputExportBundle,
  type OutputExportWorkerErrorResponse,
  type OutputExportWorkerRequest,
  type OutputExportWorkerResponse,
  type OutputExportWorkerResultResponse,
} from "@/lib/output-export";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<OutputExportWorkerRequest>) => {
  const { payload, requestId } = event.data;

  try {
    const response: OutputExportWorkerResultResponse = {
      payload: buildOutputExportBundle(payload),
      requestId,
      type: "result",
    };

    self.postMessage(response);
  } catch (error) {
    const response: OutputExportWorkerErrorResponse = {
      error: error instanceof Error ? error.message : "Failed to prepare export.",
      requestId,
      type: "error",
    };

    self.postMessage(response satisfies OutputExportWorkerResponse);
  }
};
