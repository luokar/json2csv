import { useEffect, useRef, useState } from "react";

import { loadFormatRules, saveFormatRules } from "@/hooks/use-format-rules-storage";
import type { FormatRule } from "@/lib/conditional-formatting";

const saveDebounceMs = 500;

export interface FormatRulesPersistenceApi {
  formatRules: FormatRule[];
  setFormatRules: (rules: FormatRule[]) => void;
}

/**
 * Loads format rules from localStorage when the dataset key changes and
 * debounces saves on every change. Save effects are gated until hydration
 * for the active key has run, so they cannot clobber a fresh load.
 */
export function useFormatRulesPersistence(
  datasetKey: string,
  hasHeaders: boolean,
): FormatRulesPersistenceApi {
  const [formatRules, setFormatRules] = useState<FormatRule[]>([]);
  const hydratedKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Restore on dataset change.
  useEffect(() => {
    if (!hasHeaders) return;
    if (hydratedKeyRef.current === datasetKey) return;
    hydratedKeyRef.current = datasetKey;
    setFormatRules(loadFormatRules(datasetKey) ?? []);
  }, [datasetKey, hasHeaders]);

  // Debounced save after hydration.
  useEffect(() => {
    if (!hasHeaders) return;
    if (hydratedKeyRef.current !== datasetKey) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveFormatRules(datasetKey, formatRules);
    }, saveDebounceMs);
    return () => clearTimeout(saveTimerRef.current);
  }, [formatRules, datasetKey, hasHeaders]);

  return { formatRules, setFormatRules };
}
