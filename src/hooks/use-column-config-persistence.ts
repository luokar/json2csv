import { useCallback, useEffect, useRef, useState } from "react";

import { loadColumnPreferences, saveColumnPreferences } from "@/hooks/use-column-preferences";
import { useUndoStack, type UndoStack } from "@/hooks/use-undo-stack";

export interface ColumnConfig {
  columnOrder: string[];
  headerAliases: Record<string, string>;
  hiddenColumns: Set<string>;
}

const initialColumnConfig: ColumnConfig = {
  columnOrder: [],
  headerAliases: {},
  hiddenColumns: new Set(),
};

const saveDebounceMs = 500;

export interface ColumnConfigState {
  columnConfigStack: UndoStack<ColumnConfig>;
  columnOrder: string[];
  headerAliases: Record<string, string>;
  hiddenColumns: Set<string>;
  setColumnOrder: (next: string[]) => void;
  setHeaderAliases: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  setHiddenColumns: (next: Set<string>) => void;
  pinnedColumnIds: string[];
  setPinnedColumnIds: (next: string[]) => void;
}

/**
 * Owns column ordering, header aliases, hidden columns and pinned columns
 * (no persistence). Pair with `useColumnConfigSync` once a dataset key is
 * available to load and save preferences.
 */
export function useColumnConfigState(): ColumnConfigState {
  const columnConfigStack = useUndoStack<ColumnConfig>(initialColumnConfig);
  const { columnOrder, headerAliases, hiddenColumns } = columnConfigStack.state;
  const [pinnedColumnIds, setPinnedColumnIds] = useState<string[]>([]);

  const setHeaderAliases = useCallback(
    (updater: (prev: Record<string, string>) => Record<string, string>) => {
      columnConfigStack.set({
        ...columnConfigStack.state,
        headerAliases: updater(columnConfigStack.state.headerAliases),
      });
    },
    [columnConfigStack],
  );

  const setColumnOrder = useCallback(
    (next: string[]) => {
      columnConfigStack.set({ ...columnConfigStack.state, columnOrder: next });
    },
    [columnConfigStack],
  );

  const setHiddenColumns = useCallback(
    (next: Set<string>) => {
      columnConfigStack.set({ ...columnConfigStack.state, hiddenColumns: next });
    },
    [columnConfigStack],
  );

  return {
    columnConfigStack,
    columnOrder,
    headerAliases,
    hiddenColumns,
    setColumnOrder,
    setHeaderAliases,
    setHiddenColumns,
    pinnedColumnIds,
    setPinnedColumnIds,
  };
}

interface SyncArgs {
  state: ColumnConfigState;
  datasetKey: string;
  hasHeaders: boolean;
}

/**
 * Loads column preferences from localStorage when the dataset key changes
 * and debounces saves on every change.
 */
export function useColumnConfigSync({ state, datasetKey, hasHeaders }: SyncArgs): void {
  const { columnConfigStack, columnOrder, headerAliases, hiddenColumns, pinnedColumnIds, setPinnedColumnIds } =
    state;
  const prevDatasetKeyRef = useRef(datasetKey);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!hasHeaders) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveColumnPreferences(datasetKey, {
        columnOrder,
        headerAliases,
        hiddenColumns: [...hiddenColumns],
        pinnedColumnIds,
      });
    }, saveDebounceMs);
    return () => clearTimeout(saveTimerRef.current);
  }, [columnOrder, headerAliases, hiddenColumns, pinnedColumnIds, datasetKey, hasHeaders]);

  useEffect(() => {
    if (prevDatasetKeyRef.current === datasetKey) return;
    prevDatasetKeyRef.current = datasetKey;
    if (!hasHeaders) return;
    const saved = loadColumnPreferences(datasetKey);
    if (!saved) return;
    columnConfigStack.reset({
      columnOrder: saved.columnOrder,
      headerAliases: saved.headerAliases,
      hiddenColumns: new Set(saved.hiddenColumns),
    });
    setPinnedColumnIds(saved.pinnedColumnIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey, hasHeaders]);
}
