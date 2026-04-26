import { useCallback, useEffect } from "react";

import { useUndoStack } from "@/hooks/use-undo-stack";

export type CellEditMap = Map<string, Map<string, string>>;

export interface CellEditHistoryApi {
  /** Map of rowId → (columnId → edited value). */
  cellEdits: CellEditMap;
  /** Apply an edit, pushing a new entry onto the undo stack. */
  applyEdit: (rowId: string, columnId: string, value: string) => void;
  /** Step backward through the edit history. */
  undo: () => void;
  /** Step forward through the edit history. */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Tracks per-cell user edits with full undo/redo and automatically clears
 * history when the active dataset key changes.
 */
export function useCellEditHistory(datasetKey: string): CellEditHistoryApi {
  const stack = useUndoStack<CellEditMap>(new Map());

  useEffect(() => {
    stack.reset(new Map());
    // Reset only when the dataset itself changes; resetting on stack identity
    // would defeat the undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey]);

  const applyEdit = useCallback(
    (rowId: string, columnId: string, value: string) => {
      const prev = stack.state;
      const next = new Map(prev);
      const rowEdits = new Map(next.get(rowId));
      rowEdits.set(columnId, value);
      next.set(rowId, rowEdits);
      stack.set(next);
    },
    [stack],
  );

  return {
    cellEdits: stack.state,
    applyEdit,
    undo: stack.undo,
    redo: stack.redo,
    canUndo: stack.canUndo,
    canRedo: stack.canRedo,
  };
}
