/// <reference lib="webworker" />

import {
  analyzeTablePlanRequest,
  type TablePlanWorkerRequest,
  type TablePlanWorkerResponse,
} from "@/lib/table-planner";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<TablePlanWorkerRequest>) => {
  const { payload, requestId } = event.data;
  const response: TablePlanWorkerResponse = {
    payload: analyzeTablePlanRequest(payload),
    requestId,
  };

  self.postMessage(response);
};
