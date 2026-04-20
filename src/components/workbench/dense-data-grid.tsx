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
import { ArrowDown, ArrowUp, ArrowUpDown, Clipboard, Columns3, Download, FileJson, Filter, FilterX, Pin, Search, X } from "lucide-react";
import { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { HighlightText } from "@/components/workbench/highlight-text";
import { cn } from "@/lib/utils";

const selectionColumnId = "__select__";
const emptyHiddenHeaders: string[] = [];

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
        isOver && !isDragging && "border-l-2 border-l-primary",
      )}
      style={combinedStyle}
      {...listeners}
    >
      {children}
    </TableHead>
  );
}

interface DenseDataGridProps {
  caption: string;
  columnFiltersVisible?: boolean;
  description: string;
  emptyMessage: string;
  filterLabel: string;
  getRowId?: (row: Record<string, string>, index: number) => string;
  headers: string[];
  initialHiddenHeaders?: string[];
  notices?: ReactNode;
  onColumnFiltersVisibleChange?: (visible: boolean) => void;
  onColumnOrderChange?: (newOrder: string[]) => void;
  onCopySelectedToClipboard?: (rows: Array<Record<string, string>>) => void;
  onExportSelected?: (rows: Array<Record<string, string>>) => void;
  onExportSelectedJson?: (rows: Array<Record<string, string>>) => void;
  onInspectColumn?: (header: string) => void;
  onInspectRow?: (row: Record<string, string>, rowId: string) => void;
  onOpenRowDetail?: (row: Record<string, string>, rowId: string) => void;
  onPinnedColumnChange?: (columnId: string | null) => void;
  pinnedColumnId?: string | null;
  rowCount: number;
  rowLabel: string;
  rows: Array<Record<string, string>>;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  summaryBadges?: ReactNode;
  title: string;
  toolbarActions?: ReactNode;
}

export const DenseDataGrid = memo(function DenseDataGrid({
  caption,
  columnFiltersVisible,
  description,
  emptyMessage,
  filterLabel,
  getRowId,
  headers,
  initialHiddenHeaders = emptyHiddenHeaders,
  notices,
  onColumnFiltersVisibleChange,
  onColumnOrderChange,
  onCopySelectedToClipboard,
  onExportSelected,
  onExportSelectedJson,
  onInspectColumn,
  onInspectRow,
  onOpenRowDetail,
  onPinnedColumnChange,
  pinnedColumnId,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
      ...headers.map<ColumnDef<Record<string, string>>>((header) => ({
        accessorFn: (row) => row[header],
        id: header,
        cell: ({ getValue, row, column: cellColumn }) => {
          const value = getValue<string | undefined>() ?? "";
          const isCompact = header.includes("id") || header.includes("path");
          const search = globalSearchRef.current;
          const columnFilter = cellColumn.getFilterValue();
          const filterTerm = typeof columnFilter === "string" ? columnFilter : "";

          return (
            <button
              type="button"
              className={cn(
                "block w-full truncate text-left text-sm text-foreground",
                isCompact && "font-mono text-[12px]",
              )}
              onClick={() => {
                onInspectRow?.(row.original, row.id);
              }}
            >
              {value ? <HighlightText highlight={filterTerm || search} text={value} /> : "\u00A0"}
            </button>
          );
        },
        filterFn: "includesString",
        header: ({ column }) => {
          const filterValue = column.getFilterValue();
          const sorted = column.getIsSorted();
          const isPinned = pinnedColumnId === header;

          return (
            <div className="space-y-1.5">
              <button
                aria-label={header}
                type="button"
                className="group/header flex min-h-[2.5rem] w-full items-center justify-between gap-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                title={header}
                onClick={() => {
                  if (!sorted) {
                    column.toggleSorting(false);
                  } else if (sorted === "asc") {
                    column.toggleSorting(true);
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
                <span className="truncate">{header}</span>
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
                      onPinnedColumnChange?.(isPinned ? null : header);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onPinnedColumnChange?.(isPinned ? null : header);
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
    [headers, onInspectColumn, onInspectRow, onPinnedColumnChange, pinnedColumnId, rowLabel],
  );

  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: searchedRows,
    enableColumnResizing: true,
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
    estimateSize: () => 40,
    getScrollElement: () => scrollContainerRef.current,
    overscan: 15,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const pinnedDataColumnId = (() => {
    if (pinnedColumnId && visibleLeafColumns.some((c) => c.id === pinnedColumnId)) {
      return pinnedColumnId;
    }
    return visibleLeafColumns.find((column) => column.id !== selectionColumnId)?.id;
  })();
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const visibleRowCount = table.getFilteredRowModel().rows.length;
  const hiddenColumnCount = Math.max(0, headers.length - (visibleLeafColumns.length - 1));
  const defaultVisibleColumnCount = Math.max(0, headers.length - initialHiddenHeaders.length);

  function handleHideAllColumns() {
    const nextVisibility: VisibilityState = {};
    for (const header of headers) {
      if (header === pinnedDataColumnId) continue;
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

  return (
    <section className="flex min-h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <Badge variant="outline">{rowCount.toLocaleString()} rows</Badge>
              <Badge variant="secondary">{visibleLeafColumns.length - 1} columns shown</Badge>
              {hiddenColumnCount > 0 ? (
                <Badge variant="outline">{hiddenColumnCount} hidden</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">{summaryBadges}</div>
        </div>

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
              onClick={() => setShowColumnControls((current) => !current)}
            >
              <Columns3 className="size-4" />
              Columns
            </Button>

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
              }}
            >
              <X className="size-4" />
              Clear
            </Button>

            <span className="text-xs text-muted-foreground">
              {visibleRowCount.toLocaleString()} shown
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div>
        </div>

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

            {headers.map((header) => {
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
                  onClick={() => onExportSelected(selectedRows.map((r) => r.original))}
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
                  onClick={() => onExportSelectedJson(selectedRows.map((r) => r.original))}
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
                  onClick={() => onCopySelectedToClipboard(selectedRows.map((r) => r.original))}
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

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto">
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
                      const isPinnedDataColumn = header.column.id === pinnedDataColumnId;

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

                      return (
                        <SortableHeaderCell
                          key={header.id}
                          headerId={header.column.id}
                          className={cn(
                            "relative border-r border-border/30 bg-background align-top",
                            isPinnedDataColumn && "sticky left-10 z-20",
                          )}
                          style={{ width: header.getSize() }}
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
              <DragOverlay>
                {activeDragId ? (
                  <div className="rounded border border-primary bg-background px-3 py-2 text-xs font-medium text-foreground shadow-lg">
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

                    return (
                      <TableRow
                        key={row.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        onDoubleClick={() => onOpenRowDetail?.(row.original, row.id)}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isSelectionColumn = cell.column.id === selectionColumnId;
                          const isPinnedDataColumn = cell.column.id === pinnedDataColumnId;

                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                "border-r border-border/20 bg-background",
                                isSelectionColumn && "sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2",
                                isPinnedDataColumn && "sticky left-10 z-10",
                              )}
                              style={isSelectionColumn ? undefined : { width: cell.column.getSize() }}
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
                tableRows.map((row) => (
                  <TableRow
                    key={row.id}
                    onDoubleClick={() => onOpenRowDetail?.(row.original, row.id)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isSelectionColumn = cell.column.id === selectionColumnId;
                      const isPinnedDataColumn = cell.column.id === pinnedDataColumnId;

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "border-r border-border/20 bg-background",
                            isSelectionColumn && "sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2",
                            isPinnedDataColumn && "sticky left-10 z-10",
                          )}
                          style={isSelectionColumn ? undefined : { width: cell.column.getSize() }}
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

      {contextMenu ? (
        <ColumnContextMenu
          anchorPoint={contextMenu.anchorPoint}
          columnId={contextMenu.columnId}
          isPinned={pinnedDataColumnId === contextMenu.columnId}
          isSorted={table.getColumn(contextMenu.columnId)?.getIsSorted() ?? false}
          onClose={() => setContextMenu(null)}
          onCopyName={() => void navigator.clipboard.writeText(contextMenu.columnId).then(() => toast.success("Column name copied."))}
          onHideColumn={() => table.getColumn(contextMenu.columnId)?.toggleVisibility(false)}
          onInspectColumn={() => onInspectColumn?.(contextMenu.columnId)}
          onSortAsc={() => table.getColumn(contextMenu.columnId)?.toggleSorting(false)}
          onSortDesc={() => table.getColumn(contextMenu.columnId)?.toggleSorting(true)}
          onClearSort={() => table.getColumn(contextMenu.columnId)?.clearSorting()}
          onTogglePin={() => {
            onPinnedColumnChange?.(
              pinnedDataColumnId === contextMenu.columnId ? null : contextMenu.columnId,
            );
          }}
        />
      ) : null}
    </section>
  );
});
