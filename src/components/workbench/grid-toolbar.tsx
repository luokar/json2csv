import { BarChart3, Columns3, Filter, FilterX, Paintbrush, Search, X } from "lucide-react";
import type { ColumnFiltersState, RowSelectionState } from "@tanstack/react-table";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormatRule } from "@/lib/conditional-formatting";
import { cn } from "@/lib/utils";

type GridDensity = "compact" | "default" | "comfortable";
type QuickFilterPreset = "non-empty" | "unique" | "edited";

interface GridToolbarProps {
  searchInputRef?: RefObject<HTMLInputElement | null>;
  filterLabel: string;
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  setShowColumnControls: Dispatch<SetStateAction<boolean>>;
  setColumnControlsFilter: (value: string) => void;
  showFormatPanel: boolean;
  setShowFormatPanel: Dispatch<SetStateAction<boolean>>;
  formatRules?: FormatRule[];
  onFormatRulesChange?: (rules: FormatRule[]) => void;
  onOpenStatsPanel?: () => void;
  showColumnFilters: boolean;
  setShowColumnFilters: Dispatch<SetStateAction<boolean>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>;
  setRowSelection: Dispatch<SetStateAction<RowSelectionState>>;
  activeQuickFilters: Set<QuickFilterPreset>;
  setActiveQuickFilters: Dispatch<SetStateAction<Set<QuickFilterPreset>>>;
  hasCellEdits: boolean;
  density: GridDensity;
  setDensity: (density: GridDensity) => void;
  toolbarActions?: ReactNode;
}

/**
 * Toolbar row above the data grid: global search, density toggle, and the
 * Columns/Format/Stats/Filters/Clear buttons. Owns no state of its own; all
 * mutations flow through the supplied setters.
 */
export function GridToolbar({
  searchInputRef,
  filterLabel,
  globalSearch,
  setGlobalSearch,
  setShowColumnControls,
  setColumnControlsFilter,
  showFormatPanel,
  setShowFormatPanel,
  formatRules,
  onFormatRulesChange,
  onOpenStatsPanel,
  showColumnFilters,
  setShowColumnFilters,
  columnFilters,
  setColumnFilters,
  setRowSelection,
  activeQuickFilters,
  setActiveQuickFilters,
  hasCellEdits,
  density,
  setDensity,
  toolbarActions,
}: GridToolbarProps) {
  return (
    <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 xl:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            aria-label={filterLabel}
            className="pl-9"
            placeholder="Search rows..."
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setShowColumnControls((current) => !current);
            setColumnControlsFilter("");
          }}
        >
          <Columns3 className="size-4" />
          Columns
        </Button>

        {onFormatRulesChange ? (
          <Button
            type="button"
            variant={showFormatPanel ? "outline" : "ghost"}
            onClick={() => setShowFormatPanel((current) => !current)}
          >
            <Paintbrush className="size-4" />
            Format
            {formatRules && formatRules.length > 0 ? (
              <Badge variant="secondary">{formatRules.length}</Badge>
            ) : null}
          </Button>
        ) : null}

        {onOpenStatsPanel ? (
          <Button type="button" variant="ghost" onClick={onOpenStatsPanel} title="Column statistics">
            <BarChart3 className="size-4" />
            Stats
          </Button>
        ) : null}

        <Button
          type="button"
          variant={showColumnFilters ? "outline" : "ghost"}
          onClick={() => setShowColumnFilters((current) => !current)}
        >
          <Filter className="size-4" />
          Filters
          {!showColumnFilters && columnFilters.length > 0 ? (
            <Badge variant="secondary">{columnFilters.length}</Badge>
          ) : null}
        </Button>

        {columnFilters.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setColumnFilters([])}
          >
            <FilterX className="size-4" />
            Clear filters
            <Badge variant="outline">{columnFilters.length}</Badge>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setGlobalSearch("");
            setColumnFilters([]);
            setRowSelection({});
            setActiveQuickFilters(new Set());
          }}
        >
          <X className="size-4" />
          Clear
        </Button>

        <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {(["non-empty", "unique", "edited"] as const).map((preset) => {
            const isActive = activeQuickFilters.has(preset);
            const label = preset === "non-empty" ? "Non-empty" : preset === "unique" ? "Unique" : "Edited";
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={isActive}
                disabled={preset === "edited" && !hasCellEdits}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setActiveQuickFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(preset)) next.delete(preset);
                    else next.add(preset);
                    return next;
                  });
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {(["compact", "default", "comfortable"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={density === d}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                density === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setDensity(d)}
            >
              {d === "compact" ? "S" : d === "default" ? "M" : "L"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div>
    </div>
  );
}
