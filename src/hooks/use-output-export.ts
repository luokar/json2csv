import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildOutputExportBundle,
  type OutputExportBundle,
  type OutputExportRequest,
  type OutputExportWorkerResponse,
} from "@/lib/output-export";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to prepare export.";
}

export function useOutputExport() {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  const runExport = useCallback(
    (payload: OutputExportRequest, label: string) =>
      new Promise<OutputExportBundle>((resolve, reject) => {
        setActiveLabel(label);
        setError(null);

        const settleSuccess = (bundle: OutputExportBundle) => {
          setActiveLabel(null);
          resolve(bundle);
        };

        const settleError = (message: string) => {
          setActiveLabel(null);
          setError(message);
          reject(new Error(message));
        };

        if (typeof Worker === "undefined") {
          try {
            settleSuccess(buildOutputExportBundle(payload));
          } catch (error) {
            settleError(toErrorMessage(error));
          }

          return;
        }

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        if (!workerRef.current) {
          workerRef.current = new Worker(new URL("../workers/export-worker.ts", import.meta.url), {
            type: "module",
          });
        }

        const worker = workerRef.current;
        const cleanup = () => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
        };

        const handleMessage = (event: MessageEvent<OutputExportWorkerResponse>) => {
          if (event.data.requestId !== requestId) {
            return;
          }

          cleanup();

          if (event.data.type === "error") {
            settleError(event.data.error);
            return;
          }

          settleSuccess(event.data.payload);
        };

        const handleError = (event: ErrorEvent) => {
          cleanup();
          settleError(event.message || "Failed to prepare export.");
        };

        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        worker.postMessage({ payload, requestId });
      }),
    [],
  );

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  return {
    activeLabel,
    error,
    isExporting: activeLabel !== null,
    resetError,
    runExport,
  };
}
