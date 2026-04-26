import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Clipboard, Download, FileJson, Filter, GripVertical, Pin, X } from "lucide-react";
import { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColumnContextMenu } from "@/components/workbench/column-context-menu";
import { ColumnStatsPopover } from "@/components/workbench/column-stats-popover";
import { FormatRulesPanel } from "@/components/workbench/format-rules-panel";
import { GridStatusBar } from "@/components/workbench/grid-status-bar";
import { GridToolbar } from "@/components/workbench/grid-toolbar";
import { HighlightText } from "@/components/workbench/highlight-text";
import { RowContextMenu } from "@/components/workbench/row-context-menu";
import { getMatchingStyles, type FormatRule } from "@/lib/conditional-formatting";
import { cn } from "@/lib/utils";
import type { ColumnProfile } from "@/lib/column-profiling";

const selectionColumnId = "__select__";
const rowNumberColumnId = "__rownum__";
const emptyHiddenHeaders: string[] = [];

function applyRowEdits(
  row: Record<string, string>,
  edits: Map<string, string> | undefined,
): Record<string, string> {
  if (!edits || edits.size === 0) return row;
  return { ...row, ...Object.fromEntries(edits) };
}

type GridDensity = "compact" | "default" | "comfortable";
const densityConfig = {
  compact:     { estimateSize: 32, cellClass: "px-2 py-1.5",   textClass: "text-xs", headerHeight: "min-h-[2rem]" },
  default:     { estimateSize: 40, cellClass: "px-3 py-2.5",   textClass: "text-sm", headerHeight: "min-h-[2.5rem]" },
  comfortable: { estimateSize: 48, cellClass: "px-3.5 py-3.5", textClass: "text-sm", headerHeight: "min-h-[3rem]" },
};

function InlineEditInput({
  defaultValue,
  onCancel,
  onCommit,
}: {
  defaultValue: string;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      className="w-full bg-transparent text-sm text-foreground outline-none ring-1 ring-primary rounded px-1"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onCommit(ref.current!.value);
          e.stopPropagation();
        }
        if (e.key === "Escape") {
          onCancel();
          e.stopPropagation();
        }
      }}
      onBlur={() => onCommit(ref.current!.value)}
    />
  );
}

function CellDetailPopover({
  anchorRect,
  onClose,
  value,
}: {
  anchorRect: { top: number; left: number; width: number; height: number };
  onClose: () => void;
  value: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchorRect.left, y: anchorRect.top + anchorRect.height + 4 });

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = anchorRect.top - rect.height - 4;
    if (x < 0) x = 8;
    if (x !== position.x || y !== position.y) setPosition({ x, y });
  }, [anchorRect]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 w-96 max-w-[90vw] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cell value</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(value).then(() => toast.success("Cell value copied."));
            }}
          >
            <Clipboard className="size-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto rounded border border-border bg-muted/30 p-2">
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">{value}</pre>
      </div>
    </div>,
    document.body,
  );
}

function SortableHeaderCell({
  children,
  className,
  headerId,
  style,
}: {
  children: ReactNode;
  className?: string;
  headerId: string;
  style?: CSSProperties;
}) {
  const {
    isDragging,
    isOver,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: headerId });

  const combinedStyle: CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3, zIndex: 30 } : undefined),
  };

  return (
    <TableHead
      ref={setNodeRef}
      className={cn(
        className,
        "cursor-grab",
        isDragging && "cursor-grabbing border-dashed border-primary",
        isOver && !isDragging && "border-l-2 border-l-primary bg-primary/5",
      )}
      style={combinedStyle}
      {...listeners}
    >
      {children}
    </TableHead>
  );
}

interface DenseDataGridProps {
  canCellRedo?: boolean;
  canCellUndo?: boolean;
  caption: string;
  cellEdits?: Map<string, Map<string, string>>;
  columnFiltersVisible?: boolean;
  columnProfiles?: ColumnProfile[];
  description: string;
  emptyMessage: string;
  filterLabel: string;
  formatRules?: FormatRule[];
  getRowId?: (row: Record<string, string>, index: number) => string;
  headers: string[];
  initialHiddenHeaders?: string[];
  notices?: ReactNode;
  onCellEdit?: (rowId: string, columnId: string, value: string) => void;
  onCellRedo?: () => void;
  onCellUndo?: () => void;
  onColumnFiltersVisibleChange?: (visible: boolean) => void;
  onColumnOrderChange?: (newOrder: string[]) => void;
  onCopySelectedToClipboard?: (rows: Array<Record<string, string>>) => void;
  onExportSelected?: (rows: Array<Record<string, string>>) => void;
  onExportSelectedJson?: (rows: Array<Record<string, string>>) => void;
  onFormatRulesChange?: (rules: FormatRule[]) => void;
  onInspectColumn?: (header: string) => void;
  onInspectRow?: (row: Record<string, string>, rowId: string) => void;
  onOpenRowDetail?: (row: Record<string, string>, rowId: string) => void;
  onOpenStatsPanel?: () => void;
  onPinnedColumnsChange?: (columnIds: string[]) => void;
  pendingColumnFilter?: { columnId: string; value: string; key: number } | null;
  pinnedColumnIds?: string[];
  rowCount: number;
  rowLabel: string;
  rows: Array<Record<string, string>>;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  summaryBadges?: ReactNode;
  title: string;
  toolbarActions?: ReactNode;
}

export const DenseDataGrid = memo(function DenseDataGrid({
  canCellRedo,
  canCellUndo,
  caption,
  cellEdits,
  columnFiltersVisible,
  columnProfiles,
  description,
  emptyMessage,
  filterLabel,
  formatRules,
  getRowId,
  headers,
  initialHiddenHeaders = emptyHiddenHeaders,
  notices,
  onCellEdit,
  onCellRedo,
  onCellUndo,
  onColumnFiltersVisibleChange,
  onColumnOrderChange,
  onCopySelectedToClipboard,
  onExportSelected,
  onExportSelectedJson,
  onFormatRulesChange,
  onInspectColumn,
  onInspectRow,
  onOpenRowDetail,
  onOpenStatsPanel,
  onPinnedColumnsChange,
  pendingColumnFilter,
  pinnedColumnIds,
  rowCount,
  rowLabel,
  rows,
  searchInputRef,
  summaryBadges,
  title,
  toolbarActions,
}: DenseDataGridProps) {
  const [globalSearch, setGlobalSearch] = useState("");
  const globalSearchRef = useRef(globalSearch);
  globalSearchRef.current = globalSearch;
  type QuickFilterPreset = "non-empty" | "unique" | "edited";
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<QuickFilterPreset>>(new Set());
  const [density, setDensity] = useState<GridDensity>("default");
  const [showColumnControls, setShowColumnControls] = useState(false);
  const [showColumnFilters, setShowColumnFiltersInternal] = useState(true);
  const setShowColumnFilters = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      setShowColumnFiltersInternal((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        onColumnFiltersVisibleChange?.(next);
        return next;
      });
    },
    [onColumnFiltersVisibleChange],
  );
  const showColumnFiltersRef = useRef(showColumnFilters);
  showColumnFiltersRef.current = showColumnFilters;

  useEffect(() => {
    if (columnFiltersVisible !== undefined) {
      setShowColumnFiltersInternal(columnFiltersVisible);
    }
  }, [columnFiltersVisible]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [contextMenu, setContextMenu] = useState<{
    anchorPoint: { x: number; y: number };
    columnId: string;
  } | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<{
    anchorPoint: { x: number; y: number };
    rowId: string;
  } | null>(null);
  const [statsPopover, setStatsPopover] = useState<{
    anchorPoint: { x: number; y: number };
    columnId: string;
  } | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [cellDetailPopover, setCellDetailPopover] = useState<{
    anchorRect: { top: number; left: number; width: number; height: number };
    value: string;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cellDetailPopover) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => setCellDetailPopover(null);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [cellDetailPopover]);

  const initialHiddenHeaderSet = useMemo(
    () => new Set(initialHiddenHeaders),
    [initialHiddenHeaders],
  );

  const searchedRows = useMemo(() => {
    const normalized = globalSearch.trim().toLowerCase();

    if (!normalized) {
      return rows;
    }

    return rows.filter((row) =>
      headers.some((header) => row[header]?.toLowerCase().includes(normalized)),
    );
  }, [globalSearch, headers, rows]);
  const stableRowIds = useMemo(() => {
    const nextIds = new WeakMap<Record<string, string>, string>();

    rows.forEach((row, index) => {
      nextIds.set(row, getRowId?.(row, index) ?? `row:${index}`);
    });

    return nextIds;
  }, [getRowId, rows]);
  const quickFilteredRows = useMemo(() => {
    if (activeQuickFilters.size === 0) return searchedRows;
    let result = searchedRows;
    if (activeQuickFilters.has("non-empty")) {
      result = result.filter((row) =>
        headers.some((h) => (row[h] ?? "").trim().length > 0),
      );
    }
    if (activeQuickFilters.has("unique")) {
      const seen = new Set<string>();
      result = result.filter((row) => {
        const key = headers.map((h) => row[h] ?? "").join("\0");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (activeQuickFilters.has("edited")) {
      result = result.filter((row) => {
        const rowId = stableRowIds.get(row);
        return rowId !== undefined && cellEdits?.has(rowId) === true;
      });
    }
    return result;
  }, [activeQuickFilters, searchedRows, headers, stableRowIds, cellEdits]);

  useEffect(() => {
    setColumnFilters((previous) => previous.filter((entry) => headers.includes(String(entry.id))));
    setColumnVisibility((previous) => {
      const nextVisibility: VisibilityState = {};

      for (const [columnId, isVisible] of Object.entries(previous)) {
        if (headers.includes(columnId)) {
          nextVisibility[columnId] = isVisible;
        }
      }

      for (const header of initialHiddenHeaders) {
        if (!headers.includes(header) || Object.hasOwn(nextVisibility, header)) {
          continue;
        }

        nextVisibility[header] = false;
      }

      return nextVisibility;
    });
    setRowSelection({});
  }, [headers, initialHiddenHeaders]);

  useEffect(() => {
    if (!pendingColumnFilter) return;
    if (!headers.includes(pendingColumnFilter.columnId)) return;
    setColumnFilters((prev) => {
      const filtered = prev.filter((f) => f.id !== pendingColumnFilter.columnId);
      return [...filtered, { id: pendingColumnFilter.columnId, value: pendingColumnFilter.value }];
    });
    setShowColumnFilters(true);
  }, [pendingColumnFilter, headers, setShowColumnFilters]);

  const pinnedDataColumnIdSet = useMemo(
    () => new Set((pinnedColumnIds ?? []).filter((id) => headers.includes(id))),
    [pinnedColumnIds, headers],
  );
  const orderedPinnedDataColumnIds = useMemo(
    () => headers.filter((h) => pinnedDataColumnIdSet.has(h)),
    [pinnedDataColumnIdSet, headers],
  );

  const formatRuleIndex = useMemo(() => {
    if (!formatRules?.length) return null;
    const map = new Map<string | null, FormatRule[]>();
    for (const rule of formatRules) {
      const arr = map.get(rule.columnId) ?? [];
      arr.push(rule);
      map.set(rule.columnId, arr);
    }
    return map;
  }, [formatRules]);

  const columns = useMemo<ColumnDef<Record<string, string>>[]>(
    () => [
      {
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <input
              aria-label={`Select ${rowLabel} ${row.id}`}
              checked={row.getIsSelected()}
              className="size-4 rounded border-border accent-primary"
              type="checkbox"
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
        enableColumnFilter: false,
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <input
              aria-label={`Select all visible ${rowLabel} rows`}
              checked={table.getIsAllPageRowsSelected()}
              className="size-4 rounded border-border accent-primary"
              type="checkbox"
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          </div>
        ),
        id: selectionColumnId,
        size: 40,
      },
      {
        cell: ({ row }) => (
          <span className={cn("block text-center tabular-nums text-muted-foreground", densityConfig[density].textClass)}>
            {row.index + 1}
          </span>
        ),
        enableColumnFilter: false,
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        header: () => (
          <span className="block text-center text-xs font-medium text-muted-foreground">#</span>
        ),
        id: rowNumberColumnId,
        size: 48,
      },
      ...headers.map<ColumnDef<Record<string, string>>>((header) => ({
        accessorFn: (row) => row[header],
        id: header,
        cell: ({ getValue, row, column: cellColumn }) => {
          const rawValue = getValue<string | undefined>() ?? "";
          const editedValue = cellEdits?.get(row.id)?.get(header);
          const value = editedValue ?? rawValue;
          const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === header;
          const isCompact = header.includes("id") || header.includes("path");
          const search = globalSearchRef.current;
          const columnFilter = cellColumn.getFilterValue();
          const filterTerm = typeof columnFilter === "string" ? columnFilter : "";
          const cellFormatStyle = formatRuleIndex ? getMatchingStyles(
            [...(formatRuleIndex.get(header) ?? []), ...(formatRuleIndex.get(null) ?? [])],
            header, value,
          ) : null;

          if (isEditing) {
            return (
              <InlineEditInput
                defaultValue={value}
                onCancel={() => setEditingCell(null)}
                onCommit={(newValue) => {
                  setEditingCell(null);
                  if (newValue !== rawValue) {
                    onCellEdit?.(row.id, header, newValue);
                  }
                }}
              />
            );
          }

          return (
            <button
              type="button"
              className={cn(
                "block w-full truncate text-left text-foreground",
                densityConfig[density].textClass,
                isCompact && "font-mono text-[12px]",
                editedValue !== undefined && "italic border-l-2 border-l-primary pl-1",
              )}
              style={cellFormatStyle ?? undefined}
              title={editedValue !== undefined ? `Edited (was: ${rawValue || "(empty)"})` : undefined}
              onClick={(e) => {
                onInspectRow?.(row.original, row.id);
                const target = e.currentTarget;
                if (target.scrollWidth > target.clientWidth) {
                  const rect = target.getBoundingClientRect();
                  setCellDetailPopover({
                    anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                    value,
                  });
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingCell({ rowId: row.id, columnId: header });
                setFocusedCell({ rowId: row.id, columnId: header });
              }}
            >
              {value ? <HighlightText highlight={filterTerm || search} text={value} /> : "\u00A0"}
            </button>
          );
        },
        filterFn: "includesString",
        header: ({ column, table: tbl }) => {
          const filterValue = column.getFilterValue();
          const sorted = column.getIsSorted();
          const isPinned = pinnedDataColumnIdSet.has(header);
          const sortIndex = column.getSortIndex();
          const multiSortActive = tbl.getState().sorting.length > 1;
          const groupPrefix = header.includes(".") ? header.slice(0, header.indexOf(".")) : null;
          const belongsToGroup = groupPrefix !== null && columnGroups.has(groupPrefix);

          return (
            <div className="space-y-1.5">
              <button
                aria-label={header}
                type="button"
                className={cn("group/header flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", densityConfig[density].headerHeight)}
                title={header}
                onClick={(e) => {
                  if (!sorted) {
                    column.toggleSorting(false, e.shiftKey);
                  } else if (sorted === "asc") {
                    column.toggleSorting(true, e.shiftKey);
                  } else {
                    column.clearSorting();
                  }
                  onInspectColumn?.(header);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ anchorPoint: { x: e.clientX, y: e.clientY }, columnId: header });
                }}
              >
                <span className="flex min-w-0 items-center gap-1">
                  {belongsToGroup ? (
                    <span className="shrink-0 rounded-sm bg-primary/10 px-1 py-px text-[9px] font-medium text-primary">
                      {groupPrefix}
                    </span>
                  ) : null}
                  <span className="truncate">{header}</span>
                  {(() => {
                    const matchingRules = [
                      ...(formatRuleIndex?.get(header) ?? []),
                      ...(formatRuleIndex?.get(null) ?? []),
                    ];
                    if (matchingRules.length === 0) return null;
                    const swatch = matchingRules[0]?.style.bg ?? "var(--primary)";
                    return (
                      <span
                        className="ml-1 size-1.5 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: swatch }}
                        title={`${matchingRules.length} format rule${matchingRules.length === 1 ? "" : "s"} applied`}
                      />
                    );
                  })()}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={isPinned ? `Unpin ${header}` : `Pin ${header}`}
                    className={cn(
                      "rounded p-0.5 transition-colors",
                      isPinned
                        ? "text-primary hover:text-primary/80"
                        : "invisible text-muted-foreground/60 hover:text-foreground group-hover/header:visible",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPinnedColumnsChange?.(isPinned
                        ? orderedPinnedDataColumnIds.filter((id) => id !== header)
                        : [...orderedPinnedDataColumnIds, header],
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onPinnedColumnsChange?.(isPinned
                          ? orderedPinnedDataColumnIds.filter((id) => id !== header)
                          : [...orderedPinnedDataColumnIds, header],
                        );
                      }
                    }}
                  >
                    <Pin className="size-3" />
                  </span>
                  {!showColumnFiltersRef.current && typeof filterValue === "string" && filterValue ? (
                    <Filter aria-hidden className="size-3 text-primary" />
                  ) : null}
                  {sorted === "asc" ? (
                    <ArrowUp aria-hidden className="size-3 text-primary" />
                  ) : sorted === "desc" ? (
                    <ArrowDown aria-hidden className="size-3 text-primary" />
                  ) : (
                    <ArrowUpDown aria-hidden className="size-3 text-muted-foreground/60" />
                  )}
                  {multiSortActive && sortIndex >= 0 ? (
                    <span className="flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {sortIndex + 1}
                    </span>
                  ) : null}
                </span>
              </button>
              {showColumnFiltersRef.current ? (
                <div className="relative">
                  <Input
                    aria-label={`Filter ${header}`}
                    className="h-7 rounded-md bg-background px-2 pr-7 text-xs"
                    placeholder="Filter..."
                    value={typeof filterValue === "string" ? filterValue : ""}
                    onChange={(event) => column.setFilterValue(event.target.value)}
                  />
                  {typeof filterValue === "string" && filterValue ? (
                    <button
                      type="button"
                      aria-label={`Clear ${header} filter`}
                      className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => column.setFilterValue("")}
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        },
        minSize: 60,
        size: header.includes("id") ? 160 : 220,
      })),
    ],
    [density, formatRuleIndex, headers, onInspectColumn, onInspectRow, onPinnedColumnsChange, pinnedDataColumnIdSet, orderedPinnedDataColumnIds, rowLabel],
  );

  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: quickFilteredRows,
    enableColumnResizing: true,
    enableMultiSort: true,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row, index) => stableRowIds.get(row) ?? getRowId?.(row, index) ?? `row:${index}`,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnSizing,
      columnVisibility,
      rowSelection,
      sorting,
    },
  });

  const tableRows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    estimateSize: () => densityConfig[density].estimateSize,
    getScrollElement: () => scrollContainerRef.current,
    overscan: 15,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const dataColumnIds = useMemo(
    () => visibleLeafColumns.filter((c) => c.id !== selectionColumnId && c.id !== rowNumberColumnId).map((c) => c.id),
    [visibleLeafColumns],
  );
  const columnGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const header of headers) {
      const dotIndex = header.indexOf(".");
      if (dotIndex > 0) {
        const prefix = header.slice(0, dotIndex);
        const existing = groups.get(prefix) ?? [];
        existing.push(header);
        groups.set(prefix, existing);
      }
    }
    for (const [prefix, cols] of groups) {
      if (cols.length < 2) groups.delete(prefix);
    }
    return groups;
  }, [headers]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [columnControlsFilter, setColumnControlsFilter] = useState("");
  const frozenColumnLeftOffsets = useMemo(() => {
    const SELECTION_WIDTH = 40;
    const ROWNUM_WIDTH = 48;
    const offsets = new Map<string, number>();
    let left = SELECTION_WIDTH + ROWNUM_WIDTH;
    for (const colId of orderedPinnedDataColumnIds) {
      const col = visibleLeafColumns.find((c) => c.id === colId);
      offsets.set(colId, left);
      left += col?.getSize() ?? 220;
    }
    return offsets;
  }, [orderedPinnedDataColumnIds, visibleLeafColumns, columnSizing]);
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const visibleRowCount = table.getFilteredRowModel().rows.length;
  const hiddenColumnCount = Math.max(0, headers.length - (visibleLeafColumns.length - 2));
  const defaultVisibleColumnCount = Math.max(0, headers.length - initialHiddenHeaders.length);
  const editCount = useMemo(() => {
    if (!cellEdits) return 0;
    let count = 0;
    for (const rowEdits of cellEdits.values()) count += rowEdits.size;
    return count;
  }, [cellEdits]);

  const [showFormatPanel, setShowFormatPanel] = useState(false);

  function handleHideAllColumns() {
    const nextVisibility: VisibilityState = {};
    for (const header of headers) {
      if (pinnedDataColumnIdSet.has(header)) continue;
      nextVisibility[header] = false;
    }
    setColumnVisibility(nextVisibility);
  }

  function handleShowAllColumns() {
    setColumnVisibility({});
  }

  function handleResetColumnPreview() {
    const nextVisibility: VisibilityState = {};

    for (const header of headers) {
      if (initialHiddenHeaderSet.has(header)) {
        nextVisibility[header] = false;
      }
    }

    setColumnVisibility(nextVisibility);
  }

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;

      if (!over || active.id === over.id || !onColumnOrderChange) return;

      const oldIndex = headers.indexOf(String(active.id));
      const newIndex = headers.indexOf(String(over.id));

      if (oldIndex === -1 || newIndex === -1) return;

      onColumnOrderChange(arrayMove(headers, oldIndex, newIndex));
    },
    [headers, onColumnOrderChange],
  );

  function toggleGroupCollapse(prefix: string) {
    const cols = columnGroups.get(prefix);
    if (!cols) return;
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
        setColumnVisibility((v) => {
          const nextV = { ...v };
          for (const col of cols) delete nextV[col];
          return nextV;
        });
      } else {
        next.add(prefix);
        setColumnVisibility((v) => {
          const nextV = { ...v };
          for (const col of cols) nextV[col] = false;
          return nextV;
        });
      }
      return next;
    });
  }

  function handleGridKeyDown(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    if (!focusedCell) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        if (tableRows.length > 0 && dataColumnIds.length > 0) {
          setFocusedCell({ rowId: tableRows[0]!.id, columnId: dataColumnIds[0]! });
        }
      }
      return;
    }

    const currentRowIdx = tableRows.findIndex((r) => r.id === focusedCell.rowId);
    const currentColIdx = dataColumnIds.indexOf(focusedCell.columnId);
    if (currentRowIdx === -1 || currentColIdx === -1) {
      setFocusedCell(null);
      return;
    }

    switch (e.key) {
      case "ArrowUp": {
        e.preventDefault();
        const nextRow = Math.max(0, currentRowIdx - 1);
        setFocusedCell({ rowId: tableRows[nextRow]!.id, columnId: focusedCell.columnId });
        rowVirtualizer.scrollToIndex(nextRow);
        break;
      }
      case "ArrowDown": {
        e.preventDefault();
        const nextRow = Math.min(tableRows.length - 1, currentRowIdx + 1);
        setFocusedCell({ rowId: tableRows[nextRow]!.id, columnId: focusedCell.columnId });
        rowVirtualizer.scrollToIndex(nextRow);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        const nextCol = Math.max(0, currentColIdx - 1);
        setFocusedCell({ rowId: focusedCell.rowId, columnId: dataColumnIds[nextCol]! });
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        const nextCol = Math.min(dataColumnIds.length - 1, currentColIdx + 1);
        setFocusedCell({ rowId: focusedCell.rowId, columnId: dataColumnIds[nextCol]! });
        break;
      }
      case "Enter": {
        e.preventDefault();
        const row = tableRows[currentRowIdx];
        if (row) onOpenRowDetail?.(row.original, row.id);
        break;
      }
      case "Escape": {
        e.preventDefault();
        setFocusedCell(null);
        break;
      }
      case "Tab": {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentColIdx > 0) {
            setFocusedCell({ rowId: focusedCell.rowId, columnId: dataColumnIds[currentColIdx - 1]! });
          } else if (currentRowIdx > 0) {
            setFocusedCell({ rowId: tableRows[currentRowIdx - 1]!.id, columnId: dataColumnIds[dataColumnIds.length - 1]! });
            rowVirtualizer.scrollToIndex(currentRowIdx - 1);
          }
        } else {
          if (currentColIdx < dataColumnIds.length - 1) {
            setFocusedCell({ rowId: focusedCell.rowId, columnId: dataColumnIds[currentColIdx + 1]! });
          } else if (currentRowIdx < tableRows.length - 1) {
            setFocusedCell({ rowId: tableRows[currentRowIdx + 1]!.id, columnId: dataColumnIds[0]! });
            rowVirtualizer.scrollToIndex(currentRowIdx + 1);
          }
        }
        break;
      }
      case "F2": {
        e.preventDefault();
        setEditingCell({ rowId: focusedCell.rowId, columnId: focusedCell.columnId });
        break;
      }
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <Badge variant="outline">{rowCount.toLocaleString()} rows</Badge>
              <Badge variant="secondary">{visibleLeafColumns.length - 2} columns shown</Badge>
              {hiddenColumnCount > 0 ? (
                <Badge variant="outline">{hiddenColumnCount} hidden</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">{summaryBadges}</div>
        </div>

        <GridToolbar
          searchInputRef={searchInputRef}
          filterLabel={filterLabel}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          setShowColumnControls={setShowColumnControls}
          setColumnControlsFilter={setColumnControlsFilter}
          showFormatPanel={showFormatPanel}
          setShowFormatPanel={setShowFormatPanel}
          formatRules={formatRules}
          onFormatRulesChange={onFormatRulesChange}
          onOpenStatsPanel={onOpenStatsPanel}
          showColumnFilters={showColumnFilters}
          setShowColumnFilters={setShowColumnFilters}
          columnFilters={columnFilters}
          setColumnFilters={setColumnFilters}
          setRowSelection={setRowSelection}
          activeQuickFilters={activeQuickFilters}
          setActiveQuickFilters={setActiveQuickFilters}
          hasCellEdits={Boolean(cellEdits && cellEdits.size > 0)}
          density={density}
          setDensity={setDensity}
          toolbarActions={toolbarActions}
        />

        {showColumnControls ? (
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleShowAllColumns}
                >
                  Show all columns
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleHideAllColumns}
              >
                Hide all columns
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleResetColumnPreview}
              >
                Reset to default columns
              </Button>
              {onColumnOrderChange ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onColumnOrderChange([])}
                >
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

            {headers.filter((h) => !columnControlsFilter || h.toLowerCase().includes(columnControlsFilter.toLowerCase())).map((header) => {
              const column = table.getColumn(header);

              if (!column) {
                return null;
              }

              return (
                <label
                  key={header}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50 cursor-default"
                >
                  <input
                    aria-label={`${header} column visibility`}
                    checked={column.getIsVisible()}
                    className="size-4 rounded border-border accent-primary"
                    type="checkbox"
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  <span className="max-w-[12rem] truncate">{header}</span>
                </label>
              );
            })}
          </div>
        ) : null}

        {showFormatPanel && onFormatRulesChange ? (
          <FormatRulesPanel
            formatRules={formatRules ?? []}
            onFormatRulesChange={onFormatRulesChange}
            headers={headers}
          />
        ) : null}

        {selectedRows.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-2 border-l-primary bg-accent px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-foreground">
              <Badge>{selectedRows.length} selected</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const firstSelected = selectedRows[0];

                  if (!firstSelected) {
                    return;
                  }

                  onOpenRowDetail?.(firstSelected.original, firstSelected.id);
                }}
              >
                View details
              </Button>
              {onExportSelected ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onExportSelected(selectedRows.map((r) => applyRowEdits(r.original, cellEdits?.get(r.id))))}
                >
                  <Download className="size-4" />
                  Export CSV
                </Button>
              ) : null}
              {onExportSelectedJson ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onExportSelectedJson(selectedRows.map((r) => applyRowEdits(r.original, cellEdits?.get(r.id))))}
                >
                  <FileJson className="size-4" />
                  Export JSON
                </Button>
              ) : null}
              {onCopySelectedToClipboard ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onCopySelectedToClipboard(selectedRows.map((r) => applyRowEdits(r.original, cellEdits?.get(r.id))))}
                >
                  <Clipboard className="size-4" />
                  Copy
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                Clear selection
              </Button>
            </div>
          </div>
        ) : null}

        {notices ? <div className="mt-3 space-y-1.5">{notices}</div> : null}
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto outline-none" tabIndex={0} onKeyDown={handleGridKeyDown}>
        <table
          className="caption-bottom text-sm table-fixed"
          style={{ width: table.getTotalSize() }}
        >
          <caption className="mt-4 px-5 pb-4 text-left text-sm text-muted-foreground">
            {caption}
          </caption>
          <TableHeader className="sticky top-0 z-20">
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={headers} strategy={horizontalListSortingStrategy}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="bg-background hover:bg-background border-b border-border">
                    {headerGroup.headers.map((header) => {
                      const isSelectionColumn = header.column.id === selectionColumnId;
                      const isRowNumberColumn = header.column.id === rowNumberColumnId;
                      const isFrozenDataColumn = pinnedDataColumnIdSet.has(header.column.id);
                      const frozenLeft = frozenColumnLeftOffsets.get(header.column.id);

                      if (isSelectionColumn) {
                        return (
                          <TableHead
                            key={header.id}
                            className="relative sticky left-0 z-30 w-10 min-w-10 max-w-10 border-r border-border/30 bg-background px-2 align-top"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        );
                      }

                      if (isRowNumberColumn) {
                        return (
                          <TableHead
                            key={header.id}
                            className="relative sticky left-10 z-30 w-12 min-w-12 max-w-12 border-r border-border/30 bg-background px-2 align-top"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        );
                      }

                      return (
                        <SortableHeaderCell
                          key={header.id}
                          headerId={header.column.id}
                          className={cn(
                            "relative border-r border-border/30 bg-background align-top",
                            isFrozenDataColumn && "sticky z-20",
                          )}
                          style={{ width: header.getSize(), ...(isFrozenDataColumn && frozenLeft !== undefined ? { left: frozenLeft } : {}) }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanResize() ? (
                            <div
                              className={cn(
                                "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                                header.column.getIsResizing()
                                  ? "bg-primary opacity-100"
                                  : "opacity-0 hover:opacity-100 bg-border",
                              )}
                              onDoubleClick={() => header.column.resetSize()}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                            />
                          ) : null}
                        </SortableHeaderCell>
                      );
                    })}
                  </TableRow>
                ))}
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeDragId ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-background px-3 py-2 text-xs font-medium text-foreground shadow-xl ring-1 ring-primary/20">
                    <GripVertical className="size-3 text-muted-foreground" />
                    {activeDragId}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </TableHeader>
          <tbody className="[&_tr:last-child]:border-0 [&_tr]:border-b [&_tr]:border-border/50">
            {tableRows.length > 0 ? (
              virtualItems.length > 0 ? (
                <>
                  {virtualItems[0]?.start ? (
                    <tr>
                      <td
                        style={{ height: virtualItems[0].start, padding: 0 }}
                        colSpan={visibleLeafColumns.length}
                      />
                    </tr>
                  ) : null}
                  {virtualItems.map((virtualRow) => {
                    const row = tableRows[virtualRow.index];
                    const isOddRow = virtualRow.index % 2 === 1;

                    return (
                      <TableRow
                        key={row.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        onDoubleClick={() => onOpenRowDetail?.(row.original, row.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setRowContextMenu({ anchorPoint: { x: e.clientX, y: e.clientY }, rowId: row.id });
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isSelectionColumn = cell.column.id === selectionColumnId;
                          const isRowNumberColumn = cell.column.id === rowNumberColumnId;
                          const isFrozenDataColumn = pinnedDataColumnIdSet.has(cell.column.id);
                          const frozenLeft = frozenColumnLeftOffsets.get(cell.column.id);
                          const cellBg = isOddRow ? "bg-muted/20" : "bg-background";
                          const isDataColumn = !isSelectionColumn && !isRowNumberColumn;
                          const isFocusedCell = isDataColumn && focusedCell?.rowId === row.id && focusedCell?.columnId === cell.column.id;

                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                "border-r border-border/20",
                                cellBg,
                                densityConfig[density].cellClass,
                                isSelectionColumn && "sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2",
                                isRowNumberColumn && "sticky left-10 z-10 w-12 min-w-12 max-w-12 px-2",
                                isFrozenDataColumn && "sticky z-10",
                                isFocusedCell && "ring-2 ring-inset ring-primary",
                              )}
                              style={
                                isSelectionColumn || isRowNumberColumn
                                  ? undefined
                                  : { width: cell.column.getSize(), ...(isFrozenDataColumn && frozenLeft !== undefined ? { left: frozenLeft } : {}) }
                              }
                              onClick={isDataColumn ? () => setFocusedCell({ rowId: row.id, columnId: cell.column.id }) : undefined}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                  {rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0) > 0 ? (
                    <tr>
                      <td
                        style={{
                          height: rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0),
                          padding: 0,
                        }}
                        colSpan={visibleLeafColumns.length}
                      />
                    </tr>
                  ) : null}
                </>
              ) : (
                tableRows.map((row, rowIndex) => (
                  <TableRow
                    key={row.id}
                    onDoubleClick={() => onOpenRowDetail?.(row.original, row.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setRowContextMenu({ anchorPoint: { x: e.clientX, y: e.clientY }, rowId: row.id });
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isSelectionColumn = cell.column.id === selectionColumnId;
                      const isRowNumberColumn = cell.column.id === rowNumberColumnId;
                      const isFrozenDataColumn = pinnedDataColumnIdSet.has(cell.column.id);
                      const frozenLeft = frozenColumnLeftOffsets.get(cell.column.id);
                      const cellBg = rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background";
                      const isDataColumn = !isSelectionColumn && !isRowNumberColumn;
                      const isFocusedCell = isDataColumn && focusedCell?.rowId === row.id && focusedCell?.columnId === cell.column.id;

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "border-r border-border/20",
                            cellBg,
                            densityConfig[density].cellClass,
                            isSelectionColumn && "sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2",
                            isRowNumberColumn && "sticky left-10 z-10 w-12 min-w-12 max-w-12 px-2",
                            isFrozenDataColumn && "sticky z-10",
                            isFocusedCell && "ring-2 ring-inset ring-primary",
                          )}
                          style={
                            isSelectionColumn || isRowNumberColumn
                              ? undefined
                              : { width: cell.column.getSize(), ...(isFrozenDataColumn && frozenLeft !== undefined ? { left: frozenLeft } : {}) }
                          }
                          onClick={isDataColumn ? () => setFocusedCell({ rowId: row.id, columnId: cell.column.id }) : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )
            ) : (
              <tr>
                <td
                  colSpan={Math.max(visibleLeafColumns.length, 1)}
                  className="py-20 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <GridStatusBar
        rowCount={rowCount}
        rowLabel={rowLabel}
        visibleRowCount={visibleRowCount}
        selectedCount={selectedRows.length}
        editCount={editCount}
        canCellUndo={canCellUndo}
        canCellRedo={canCellRedo}
        onCellUndo={onCellUndo}
        onCellRedo={onCellRedo}
      />

      {contextMenu ? (
        <ColumnContextMenu
          anchorPoint={contextMenu.anchorPoint}
          columnId={contextMenu.columnId}
          isPinned={pinnedDataColumnIdSet.has(contextMenu.columnId)}
          isSorted={table.getColumn(contextMenu.columnId)?.getIsSorted() ?? false}
          multiSortCount={sorting.length}
          onClearAllSorts={() => setSorting([])}
          onClose={() => setContextMenu(null)}
          onCopyName={() => void navigator.clipboard.writeText(contextMenu.columnId).then(() => toast.success("Column name copied."))}
          onHideColumn={() => table.getColumn(contextMenu.columnId)?.toggleVisibility(false)}
          onInspectColumn={() => onInspectColumn?.(contextMenu.columnId)}
          onSortAsc={() => table.getColumn(contextMenu.columnId)?.toggleSorting(false)}
          onSortDesc={() => table.getColumn(contextMenu.columnId)?.toggleSorting(true)}
          onClearSort={() => table.getColumn(contextMenu.columnId)?.clearSorting()}
          onTogglePin={() => {
            const current = pinnedColumnIds ?? [];
            const updated = current.includes(contextMenu.columnId)
              ? current.filter((id) => id !== contextMenu.columnId)
              : [...current, contextMenu.columnId];
            onPinnedColumnsChange?.(updated);
          }}
          onViewStatistics={
            columnProfiles?.find((p) => p.header === contextMenu.columnId)
              ? () => setStatsPopover({ anchorPoint: contextMenu.anchorPoint, columnId: contextMenu.columnId })
              : undefined
          }
        />
      ) : null}

      {statsPopover ? (() => {
        const profile = columnProfiles?.find((p) => p.header === statsPopover.columnId);
        if (!profile) return null;
        return (
          <ColumnStatsPopover
            anchorPoint={statsPopover.anchorPoint}
            onClose={() => setStatsPopover(null)}
            profile={profile}
          />
        );
      })() : null}

      {cellDetailPopover ? (
        <CellDetailPopover
          anchorRect={cellDetailPopover.anchorRect}
          onClose={() => setCellDetailPopover(null)}
          value={cellDetailPopover.value}
        />
      ) : null}

      {rowContextMenu ? (() => {
        const row = tableRows.find((r) => r.id === rowContextMenu.rowId);
        if (!row) return null;
        return (
          <RowContextMenu
            anchorPoint={rowContextMenu.anchorPoint}
            isSelected={row.getIsSelected()}
            onClose={() => setRowContextMenu(null)}
            onInspectRow={onInspectRow ? () => onInspectRow(row.original, row.id) : undefined}
            onOpenDetail={onOpenRowDetail ? () => onOpenRowDetail(row.original, row.id) : undefined}
            onCopyJson={() => {
              const data = applyRowEdits(row.original, cellEdits?.get(row.id));
              void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => toast.success("Row copied as JSON."));
            }}
            onCopyRow={() => {
              const data = applyRowEdits(row.original, cellEdits?.get(row.id));
              const values = headers.map((h) => data[h] ?? "").join("\t");
              void navigator.clipboard.writeText(values).then(() => toast.success("Row copied."));
            }}
            onToggleSelect={() => row.toggleSelected()}
          />
        );
      })() : null}
    </section>
  );
});
