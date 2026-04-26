interface GridStatusBarProps {
  rowCount: number;
  rowLabel: string;
  visibleRowCount: number;
  selectedCount: number;
  editCount: number;
  canCellUndo?: boolean;
  canCellRedo?: boolean;
  onCellUndo?: () => void;
  onCellRedo?: () => void;
}

/**
 * Status bar shown beneath the grid: row counts, selection, edit count and
 * cell-edit undo/redo controls.
 */
export function GridStatusBar({
  rowCount,
  rowLabel,
  visibleRowCount,
  selectedCount,
  editCount,
  canCellUndo,
  canCellRedo,
  onCellUndo,
  onCellRedo,
}: GridStatusBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-border bg-background px-4 py-1.5 text-xs text-muted-foreground">
      <span>
        {rowCount.toLocaleString()} total {rowLabel}s
      </span>
      {visibleRowCount !== rowCount ? (
        <span>{visibleRowCount.toLocaleString()} shown</span>
      ) : null}
      {selectedCount > 0 ? (
        <span className="text-primary">{selectedCount.toLocaleString()} selected</span>
      ) : null}
      {editCount > 0 ? (
        <span className="text-primary">
          {editCount.toLocaleString()} edit{editCount !== 1 ? "s" : ""}
        </span>
      ) : null}
      {onCellUndo || onCellRedo ? (
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canCellUndo}
            onClick={() => onCellUndo?.()}
            title="Undo cell edit (⌘/Ctrl+Alt+Z)"
          >
            ↶
          </button>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canCellRedo}
            onClick={() => onCellRedo?.()}
            title="Redo cell edit (⌘/Ctrl+Alt+Shift+Z)"
          >
            ↷
          </button>
        </span>
      ) : null}
    </div>
  );
}
