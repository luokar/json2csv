import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, Columns3, Search, SlidersHorizontal, X } from "lucide-react";
import { memo, type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const selectionColumnId = "__select__";
const emptyHiddenHeaders: string[] = [];

interface DenseDataGridProps {
  caption: string;
  description: string;
  emptyMessage: string;
  filterLabel: string;
  getRowId?: (row: Record<string, string>, index: number) => string;
  headers: string[];
  initialHiddenHeaders?: string[];
  notices?: ReactNode;
  onInspectColumn?: (header: string) => void;
  onInspectRow?: (row: Record<string, string>, rowId: string) => void;
  rowCount: number;
  rowLabel: string;
  rows: Array<Record<string, string>>;
  summaryBadges?: ReactNode;
  title: string;
  toolbarActions?: ReactNode;
}

export const DenseDataGrid = memo(function DenseDataGrid({
  caption,
  description,
  emptyMessage,
  filterLabel,
  getRowId,
  headers,
  initialHiddenHeaders = emptyHiddenHeaders,
  notices,
  onInspectColumn,
  onInspectRow,
  rowCount,
  rowLabel,
  rows,
  summaryBadges,
  title,
  toolbarActions,
}: DenseDataGridProps) {
  const [globalSearch, setGlobalSearch] = useState("");
  const [showColumnControls, setShowColumnControls] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
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
              className="size-3.5 rounded border-border"
              type="checkbox"
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
        enableColumnFilter: false,
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <input
              aria-label={`Select all visible ${rowLabel} rows`}
              checked={table.getIsAllPageRowsSelected()}
              className="size-3.5 rounded border-border"
              type="checkbox"
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          </div>
        ),
        id: selectionColumnId,
        size: 40,
      },
      ...headers.map<ColumnDef<Record<string, string>>>((header) => ({
        accessorKey: header,
        cell: ({ getValue, row }) => {
          const value = getValue<string | undefined>() ?? "";
          const isCompact = header.includes("id") || header.includes("path");

          return (
            <button
              type="button"
              className={cn(
                "block w-full max-w-[18rem] truncate text-left text-[13px] text-foreground",
                isCompact && "font-mono text-[12px]",
              )}
              onClick={() => {
                onInspectRow?.(row.original, row.id);
              }}
            >
              {value || " "}
            </button>
          );
        },
        filterFn: "includesString",
        header: ({ column }) => {
          const filterValue = column.getFilterValue();

          return (
            <div className="space-y-1.5">
              <button
                aria-label={header}
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left text-[12px] font-semibold text-foreground"
                title={header}
                onClick={() => {
                  column.toggleSorting(column.getIsSorted() === "asc");
                  onInspectColumn?.(header);
                }}
              >
                <span className="truncate">{header}</span>
                <ArrowUpDown aria-hidden className="size-3 text-muted-foreground" />
              </button>
              <Input
                aria-label={`Filter ${header}`}
                className="h-7 rounded-[10px] bg-background/96 px-2 text-xs"
                placeholder="Filter"
                value={typeof filterValue === "string" ? filterValue : ""}
                onChange={(event) => column.setFilterValue(event.target.value)}
              />
            </div>
          );
        },
        size: header.includes("id") ? 160 : 220,
      })),
    ],
    [headers, onInspectColumn, onInspectRow, rowLabel],
  );

  const table = useReactTable({
    columns,
    data: searchedRows,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row, index) => stableRowIds.get(row) ?? getRowId?.(row, index) ?? `row:${index}`,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnVisibility,
      rowSelection,
      sorting,
    },
  });

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const pinnedDataColumnId = visibleLeafColumns.find(
    (column) => column.id !== selectionColumnId,
  )?.id;
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const visibleRowCount = table.getFilteredRowModel().rows.length;
  const hiddenColumnCount = Math.max(0, headers.length - (visibleLeafColumns.length - 1));
  const defaultVisibleColumnCount = Math.max(0, headers.length - initialHiddenHeaders.length);

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

  return (
    <section className="flex min-h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-[var(--radius)] border border-border/90 bg-card/92 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.34)]">
      <div className="border-b border-border/80 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <Badge variant="outline">{rowCount.toLocaleString()} rows</Badge>
              <Badge variant="secondary">{visibleLeafColumns.length - 1} visible columns</Badge>
              {hiddenColumnCount > 0 ? (
                <Badge variant="outline">{hiddenColumnCount} hidden</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">{summaryBadges}</div>
        </div>

        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1 xl:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={filterLabel}
                className="pl-9"
                placeholder="Search visible rows"
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowColumnControls((current) => !current)}
            >
              <Columns3 className="size-4" />
              Columns
            </Button>

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
              Clear filters
            </Button>

            <div className="inline-flex items-center gap-2 rounded-[calc(var(--radius)-2px)] border border-border/80 bg-background/86 px-3 py-2 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5 text-primary" />
              {visibleRowCount.toLocaleString()} visible rows
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div>
        </div>

        {showColumnControls ? (
          <div className="mt-3 flex flex-wrap gap-2 rounded-[calc(var(--radius)-2px)] border border-border/80 bg-background/86 p-3">
            {initialHiddenHeaders.length > 0 ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
                <p>
                  Showing {defaultVisibleColumnCount.toLocaleString()} columns by default. Reveal
                  overflow fields here when you need deeper nested context.
                </p>
                <div className="flex flex-wrap gap-2">
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
                    variant="ghost"
                    onClick={handleResetColumnPreview}
                  >
                    Reset column preview
                  </Button>
                </div>
              </div>
            ) : null}

            {headers.map((header) => {
              const column = table.getColumn(header);

              if (!column) {
                return null;
              }

              return (
                <label
                  key={header}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-border/70 bg-card px-2.5 py-1.5 text-xs text-foreground"
                >
                  <input
                    aria-label={`${header} column visibility`}
                    checked={column.getIsVisible()}
                    className="size-3.5 rounded border-border"
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[calc(var(--radius)-2px)] border border-primary/20 bg-primary/6 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-foreground">
              <Badge>{selectedRows.length} selected</Badge>
              <span className="text-sm text-muted-foreground">
                Contextual action bar for the current selection.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const firstSelected = selectedRows[0];

                  if (!firstSelected) {
                    return;
                  }

                  onInspectRow?.(firstSelected.original, firstSelected.id);
                }}
              >
                Inspect selection
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                Clear selection
              </Button>
            </div>
          </div>
        ) : null}

        {notices ? <div className="mt-3 space-y-2">{notices}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Table className="table-fixed">
          <TableCaption className="px-4 pb-4 text-left">{caption}</TableCaption>
          <TableHeader className="sticky top-0 z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-background/96 hover:bg-background/96">
                {headerGroup.headers.map((header) => {
                  const isSelectionColumn = header.column.id === selectionColumnId;
                  const isPinnedDataColumn = header.column.id === pinnedDataColumnId;

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "border-r border-border/70 bg-background/96 align-top",
                        isSelectionColumn && "sticky left-0 z-30 w-10 min-w-10 max-w-10 px-2",
                        isPinnedDataColumn && "sticky left-10 z-20 bg-background/98",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="bg-card/80">
                  {row.getVisibleCells().map((cell) => {
                    const isSelectionColumn = cell.column.id === selectionColumnId;
                    const isPinnedDataColumn = cell.column.id === pinnedDataColumnId;

                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "border-r border-border/60 bg-card/86",
                          isSelectionColumn && "sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2",
                          isPinnedDataColumn && "sticky left-10 z-10 bg-card/96",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow className="bg-card/86 hover:bg-card/86">
                <TableCell
                  colSpan={Math.max(visibleLeafColumns.length, 1)}
                  className="py-20 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
});
