import { useCallback, useState } from "react";

interface PendingColumnFilter {
  columnId: string;
  value: string;
  key: number;
}

export interface StatsPanelApi {
  /** Whether the column-statistics modal is currently open. */
  statsPanelOpen: boolean;
  /** Column to focus when the panel opens; undefined means "first column". */
  statsPanelInitialColumn: string | undefined;
  /** Open the panel, optionally focusing a specific column. */
  openStatsPanel: (columnId?: string) => void;
  /** Close the panel without changing the pending filter. */
  closeStatsPanel: () => void;
  /** Filter request emitted by the stats panel; the grid consumes and clears it. */
  pendingColumnFilter: PendingColumnFilter | null;
  /** Emit a one-shot filter request keyed by timestamp so re-applies still trigger. */
  applyColumnFilter: (columnId: string, value: string) => void;
}

/**
 * Owns the column-statistics modal's open/close state plus the one-shot
 * "filter this column by value" message that the panel emits to the grid.
 */
export function useStatsPanel(): StatsPanelApi {
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);
  const [statsPanelInitialColumn, setStatsPanelInitialColumn] = useState<string | undefined>(
    undefined,
  );
  const [pendingColumnFilter, setPendingColumnFilter] = useState<PendingColumnFilter | null>(null);

  const openStatsPanel = useCallback((columnId?: string) => {
    setStatsPanelInitialColumn(columnId);
    setStatsPanelOpen(true);
  }, []);

  const closeStatsPanel = useCallback(() => {
    setStatsPanelOpen(false);
  }, []);

  const applyColumnFilter = useCallback((columnId: string, value: string) => {
    setPendingColumnFilter({ columnId, value, key: Date.now() });
  }, []);

  return {
    statsPanelOpen,
    statsPanelInitialColumn,
    openStatsPanel,
    closeStatsPanel,
    pendingColumnFilter,
    applyColumnFilter,
  };
}
