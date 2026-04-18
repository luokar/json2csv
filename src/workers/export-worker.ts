/// <reference lib="webworker" />

import {
  buildOutputExportArtifact,
  type OutputExportWorkerErrorResponse,
  type OutputExportWorkerProgressResponse,
  type OutputExportWorkerRequest,
  type OutputExportWorkerResponse,
  type OutputExportWorkerResultResponse,
} from "@/lib/output-export";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<OutputExportWorkerRequest>) => {
  const { payload, requestId } = event.data;

  try {
    const artifact = buildOutputExportArtifact(payload, (progress) => {
      const response: OutputExportWorkerProgressResponse = {
        progress,
        requestId,
        type: "progress",
      };

      self.postMessage(response);
    });
    const response: OutputExportWorkerResultResponse = {
      payload: artifact,
      requestId,
      type: "result",
    };

    self.postMessage(response, [artifact.bytes.buffer]);
  } catch (error) {
    const response: OutputExportWorkerErrorResponse = {
      error: error instanceof Error ? error.message : "Failed to prepare export.",
      requestId,
      type: "error",
    };

    self.postMessage(response satisfies OutputExportWorkerResponse);
  }
};
