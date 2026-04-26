import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ColumnControlsPanelProps {
  headers: string[];
  initialHiddenHeaders: string[];
  defaultVisibleColumnCount: number;
  hiddenColumnCount: number;
  columnControlsFilter: string;
  setColumnControlsFilter: (value: string) => void;
  columnVisibility: Record<string, boolean>;
  onToggleColumnVisibility: (header: string) => void;
  columnGroups: Map<string, string[]>;
  collapsedGroups: Set<string>;
  toggleGroupCollapse: (prefix: string) => void;
  onShowAllColumns: () => void;
  onHideAllColumns: () => void;
  onResetColumnPreview: () => void;
  onResetColumnOrder?: () => void;
}

/**
 * Dropdown panel beneath the toolbar's "Columns" button. Shows visibility
 * checkboxes, group collapse toggles, a filter input, and bulk show/hide/reset
 * actions. Owns no state besides what is passed in.
 */
export function ColumnControlsPanel({
  headers,
  initialHiddenHeaders,
  defaultVisibleColumnCount,
  hiddenColumnCount,
  columnControlsFilter,
  setColumnControlsFilter,
  columnVisibility,
  onToggleColumnVisibility,
  columnGroups,
  collapsedGroups,
  toggleGroupCollapse,
  onShowAllColumns,
  onHideAllColumns,
  onResetColumnPreview,
  onResetColumnOrder,
}: ColumnControlsPanelProps) {
  const filterLower = columnControlsFilter.toLowerCase();
  const filteredHeaders = headers.filter(
    (h) => !columnControlsFilter || h.toLowerCase().includes(filterLower),
  );

  return (
    <div className="mt-3 flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
      {initialHiddenHeaders.length > 0 ? (
        <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          <p className="flex-1">
            Showing {defaultVisibleColumnCount.toLocaleString()} columns by default. Use the
            checkboxes below to show or hide additional columns.
          </p>
        </div>
      ) : null}

      <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
        {hiddenColumnCount > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={onShowAllColumns}>
            Show all columns
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onHideAllColumns}>
          Hide all columns
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onResetColumnPreview}>
          Reset to default columns
        </Button>
        {onResetColumnOrder ? (
          <Button type="button" size="sm" variant="ghost" onClick={onResetColumnOrder}>
            Reset column order
          </Button>
        ) : null}
      </div>

      <div className="w-full">
        <Input
          placeholder="Search columns..."
          value={columnControlsFilter}
          onChange={(e) => setColumnControlsFilter(e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {columnGroups.size > 0 ? (
        <div className="flex w-full flex-wrap gap-1">
          <span className="w-full text-xs text-muted-foreground">Column groups</span>
          {[...columnGroups.entries()].map(([prefix, cols]) => (
            <button
              key={prefix}
              type="button"
              onClick={() => toggleGroupCollapse(prefix)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs transition-colors hover:bg-muted/50"
            >
              {collapsedGroups.has(prefix) ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {prefix} ({cols.length})
            </button>
          ))}
        </div>
      ) : null}

      {filteredHeaders.map((header) => {
        if (!(header in columnVisibility)) return null;
        return (
          <label
            key={header}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50 cursor-default"
          >
            <input
              aria-label={`${header} column visibility`}
              checked={columnVisibility[header]}
              className="size-4 rounded border-border accent-primary"
              type="checkbox"
              onChange={() => onToggleColumnVisibility(header)}
            />
            <span className="max-w-[12rem] truncate">{header}</span>
          </label>
        );
      })}
    </div>
  );
}
