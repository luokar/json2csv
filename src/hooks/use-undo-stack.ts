import { useCallback, useRef, useState } from "react";

const maxPastEntries = 50;

interface UndoState<T> {
  future: T[];
  past: T[];
  present: T;
}

export interface UndoStack<T> {
  canRedo: boolean;
  canUndo: boolean;
  redo: () => void;
  reset: (state: T) => void;
  set: (next: T) => void;
  state: T;
  undo: () => void;
}

export function useUndoStack<T>(initialState: T): UndoStack<T> {
  const [undoState, setUndoState] = useState<UndoState<T>>({
    future: [],
    past: [],
    present: initialState,
  });

  const stateRef = useRef(undoState);
  stateRef.current = undoState;

  const set = useCallback((next: T) => {
    setUndoState((prev) => ({
      future: [],
      past: [prev.present, ...prev.past].slice(0, maxPastEntries),
      present: next,
    }));
  }, []);

  const undo = useCallback(() => {
    setUndoState((prev) => {
      if (prev.past.length === 0) return prev;

      const [newPresent, ...remaining] = prev.past;

      return {
        future: [prev.present, ...prev.future],
        past: remaining,
        present: newPresent,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setUndoState((prev) => {
      if (prev.future.length === 0) return prev;

      const [newPresent, ...remaining] = prev.future;

      return {
        future: remaining,
        past: [prev.present, ...prev.past].slice(0, maxPastEntries),
        present: newPresent,
      };
    });
  }, []);

  const reset = useCallback((state: T) => {
    setUndoState({
      future: [],
      past: [],
      present: state,
    });
  }, []);

  return {
    canRedo: undoState.future.length > 0,
    canUndo: undoState.past.length > 0,
    redo,
    reset,
    set,
    state: undoState.present,
    undo,
  };
}
