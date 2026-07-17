import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import {
  analyzeTablePlanRequest,
  type TablePlanAnalysis,
  type TablePlanRequest,
  type TablePlanWorkerResponse,
} from "@/lib/table-planner";

interface TablePlanAnalysisState extends TablePlanAnalysis {
  hasAnalyzed: boolean;
  isAnalyzing: boolean;
}

const initialState: TablePlanAnalysisState = {
  error: null,
  hasAnalyzed: false,
  isAnalyzing: false,
  plans: [],
  scopePath: "$",
};

export function useTablePlanAnalysis() {
  const [state, setState] = useState<TablePlanAnalysisState>(initialState);
  const requestIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    setState(initialState);
  }, []);

  const analyze = useCallback((request: TablePlanRequest) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    workerRef.current?.terminate();
    workerRef.current = null;
    setState({
      error: null,
      hasAnalyzed: false,
      isAnalyzing: true,
      plans: [],
      scopePath: request.rootPath,
    });

    if (typeof Worker === "undefined") {
      Promise.resolve().then(() => {
        const payload = analyzeTablePlanRequest(request);

        if (requestId !== requestIdRef.current) {
          return;
        }

        startTransition(() => {
          setState({ ...payload, hasAnalyzed: true, isAnalyzing: false });
        });
      });
      return;
    }

    const worker = new Worker(new URL("../workers/table-plan-worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const handleMessage = (event: MessageEvent<TablePlanWorkerResponse>) => {
      if (event.data.requestId !== requestIdRef.current) {
        return;
      }

      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.terminate();
      workerRef.current = null;
      startTransition(() => {
        setState({ ...event.data.payload, hasAnalyzed: true, isAnalyzing: false });
      });
    };
    const handleError = () => {
      if (requestId !== requestIdRef.current) {
        return;
      }

      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.terminate();
      workerRef.current = null;
      setState({
        error: "Table analysis could not be completed in the background.",
        hasAnalyzed: true,
        isAnalyzing: false,
        plans: [],
        scopePath: request.rootPath,
      });
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ payload: request, requestId });
  }, []);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  return {
    ...state,
    analyze,
    clear,
  };
}
