import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  Replace,
  RotateCcw,
  X,
} from "lucide-react";

import { InspectorSection } from "@/components/inspector/inspector-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { SelectField, ToggleField } from "@/components/ui/form-fields";

interface SelectOption {
  label: string;
  value: string;
}

export function TransformTabPanel({
  arrayIndexSuffixRegister,
  booleanRepresentationOptions,
  booleanRepresentationRegister,
  collisionStrategyOptions,
  collisionStrategyRegister,
  columnOrder,
  customPlaceholderRegister,
  dateFormatOptions,
  dateFormatRegister,
  delimiterOptions,
  delimiterRegister,
  emptyArrayBehaviorOptions,
  emptyArrayBehaviorRegister,
  flattenModeOptions,
  flattenModeRegister,
  headerAliases,
  headers,
  hiddenColumns,
  maxDepthRegister,
  missingKeyOptions,
  missingKeyRegister,
  onColumnOrderChange,
  onHeaderAliasChange,
  onHeaderAliasRemove,
  onHiddenColumnsChange,
  pathSeparatorRegister,
  placeholderStrategyOptions,
  placeholderStrategyRegister,
  quoteAllRegister,
  strictNamingRegister,
  typeMismatchOptions,
  typeMismatchRegister,
}: {
  arrayIndexSuffixRegister: UseFormRegisterReturn;
  booleanRepresentationOptions: SelectOption[];
  booleanRepresentationRegister: UseFormRegisterReturn;
  collisionStrategyOptions: SelectOption[];
  collisionStrategyRegister: UseFormRegisterReturn;
  columnOrder: string[];
  customPlaceholderRegister: UseFormRegisterReturn;
  dateFormatOptions: SelectOption[];
  dateFormatRegister: UseFormRegisterReturn;
  delimiterOptions: SelectOption[];
  delimiterRegister: UseFormRegisterReturn;
  emptyArrayBehaviorOptions: SelectOption[];
  emptyArrayBehaviorRegister: UseFormRegisterReturn;
  flattenModeOptions: SelectOption[];
  flattenModeRegister: UseFormRegisterReturn;
  headerAliases: Record<string, string>;
  headers: string[];
  hiddenColumns: Set<string>;
  maxDepthRegister: UseFormRegisterReturn;
  missingKeyOptions: SelectOption[];
  missingKeyRegister: UseFormRegisterReturn;
  onColumnOrderChange: (order: string[]) => void;
  onHeaderAliasChange: (original: string, alias: string) => void;
  onHeaderAliasRemove: (original: string) => void;
  onHiddenColumnsChange: (hidden: Set<string>) => void;
  pathSeparatorRegister: UseFormRegisterReturn;
  placeholderStrategyOptions: SelectOption[];
  placeholderStrategyRegister: UseFormRegisterReturn;
  quoteAllRegister: UseFormRegisterReturn;
  strictNamingRegister: UseFormRegisterReturn;
  typeMismatchOptions: SelectOption[];
  typeMismatchRegister: UseFormRegisterReturn;
}) {
  const aliasEntries = Object.entries(headerAliases);
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkFind, setBulkFind] = useState("");
  const [bulkReplace, setBulkReplace] = useState("");
  const [bulkUseRegex, setBulkUseRegex] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [selectedForReorder, setSelectedForReorder] = useState<Set<string>>(new Set());

  function moveColumn(header: string, direction: "up" | "down") {
    const current = columnOrder.length > 0 ? [...columnOrder] : [...headers];
    const index = current.indexOf(header);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    [current[index], current[targetIndex]] = [current[targetIndex]!, current[index]!];
    onColumnOrderChange(current);
  }

  function moveColumnToEdge(header: string, direction: "top" | "bottom") {
    const current = columnOrder.length > 0 ? [...columnOrder] : [...headers];
    const index = current.indexOf(header);
    if (index === -1) return;
    const [item] = current.splice(index, 1);
    if (direction === "top") {
      current.unshift(item!);
    } else {
      current.push(item!);
    }
    onColumnOrderChange(current);
  }

  function moveSelectedBulk(direction: "up" | "down") {
    if (selectedForReorder.size === 0) return;
    const current = columnOrder.length > 0 ? [...columnOrder] : [...headers];
    const indices = current
      .map((h, i) => (selectedForReorder.has(h) ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);

    if (direction === "up") {
      for (const idx of indices) {
        if (idx === 0) break;
        if (indices.includes(idx - 1)) continue;
        [current[idx - 1], current[idx]] = [current[idx]!, current[idx - 1]!];
      }
    } else {
      for (let j = indices.length - 1; j >= 0; j--) {
        const idx = indices[j]!;
        if (idx === current.length - 1) break;
        if (indices.includes(idx + 1)) continue;
        [current[idx], current[idx + 1]] = [current[idx + 1]!, current[idx]!];
      }
    }
    onColumnOrderChange(current);
  }

  function computeBulkRenamePreview(): Array<{ from: string; to: string }> {
    if (!bulkFind) return [];
    const results: Array<{ from: string; to: string }> = [];
    for (const header of headers) {
      try {
        const pattern = bulkUseRegex ? new RegExp(bulkFind, "g") : bulkFind;
        const newName = header.replaceAll(pattern, bulkReplace);
        if (newName !== header && newName.trim()) {
          results.push({ from: header, to: newName });
        }
      } catch {
        // invalid regex — skip
      }
    }
    return results;
  }

  function applyBulkRename() {
    const previews = computeBulkRenamePreview();
    for (const { from, to } of previews) {
      onHeaderAliasChange(from, to);
    }
    setBulkFind("");
    setBulkReplace("");
    setBulkRenameOpen(false);
  }

  const bulkPreviews = bulkRenameOpen ? computeBulkRenamePreview() : [];

  const filteredVisibilityHeaders = visibilityFilter
    ? headers.filter((h) => h.toLowerCase().includes(visibilityFilter.toLowerCase()))
    : headers;

  return (
    <>
      <InspectorSection
        description="Control how nested data becomes columns and how values appear in the CSV."
        title="Conversion options"
      >
        <div className="grid gap-2.5 md:grid-cols-2">
          <SelectField
            id="flatten-mode"
            label="Nesting style"
            hint="How nested objects inside each row are turned into columns."
            registration={flattenModeRegister}
            options={flattenModeOptions}
          />
          <SelectField
            id="placeholder-strategy"
            label="Fill empty cells"
            hint="What to put in cells when a parent row is repeated for nested items."
            registration={placeholderStrategyRegister}
            options={placeholderStrategyOptions}
          />
          <SelectField
            id="missing-keys"
            label="Missing values"
            hint="What to show when a field exists in some rows but not others."
            registration={missingKeyRegister}
            options={missingKeyOptions}
          />
          <SelectField
            id="type-mismatch"
            label="Mixed types"
            hint="What to do when the same field contains different kinds of data."
            registration={typeMismatchRegister}
            options={typeMismatchOptions}
          />
          <SelectField
            id="empty-array-behavior"
            label="Empty lists"
            registration={emptyArrayBehaviorRegister}
            options={emptyArrayBehaviorOptions}
          />
          <div className="space-y-1.5">
            <Label htmlFor="max-depth">Max nesting level</Label>
            <Input
              id="max-depth"
              type="number"
              min={1}
              max={32}
              {...maxDepthRegister}
            />
          </div>
          <SelectField
            id="collision-strategy"
            label="Duplicate column names"
            hint="What to do when different parts of the data produce columns with the same name."
            registration={collisionStrategyRegister}
            options={collisionStrategyOptions}
          />
          <SelectField
            id="boolean-representation"
            label="True/false format"
            registration={booleanRepresentationRegister}
            options={booleanRepresentationOptions}
          />
          <SelectField
            id="date-format"
            label="Date format"
            registration={dateFormatRegister}
            options={dateFormatOptions}
          />
          <SelectField
            id="delimiter"
            label="Column separator"
            registration={delimiterRegister}
            options={delimiterOptions}
          />
          <div className="space-y-1.5">
            <Label htmlFor="path-separator">Name separator</Label>
            <Input
              id="path-separator"
              placeholder="."
              {...pathSeparatorRegister}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-placeholder">Custom placeholder</Label>
            <Input
              id="custom-placeholder"
              placeholder="NULL"
              {...customPlaceholderRegister}
            />
          </div>
        </div>

        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          <ToggleField
            label="Quote every cell"
            registration={quoteAllRegister}
          />
          <ToggleField
            label="Clean column names"
            hint="Remove special characters from column headers."
            registration={strictNamingRegister}
          />
          <ToggleField
            label="Number list items"
            hint="Add a number to each column created from a list."
            registration={arrayIndexSuffixRegister}
          />
        </div>
      </InspectorSection>

      <InspectorSection
        description="Rename columns in the exported CSV."
        title="Column renames"
      >
        {aliasEntries.length === 0 && !bulkRenameOpen ? (
          <div className="flex items-center gap-2">
            <Notice>
              No renames active. Select a column in the Inspect tab to rename it.
            </Notice>
          </div>
        ) : (
          <div className="space-y-1.5">
            {aliasEntries.map(([original, alias]) => (
              <div key={original} className="flex items-center gap-1.5 text-xs">
                <span className="min-w-0 truncate font-mono text-muted-foreground">
                  {original}
                </span>
                <span className="shrink-0 text-muted-foreground">&rarr;</span>
                <span className="min-w-0 truncate font-mono font-medium">{alias}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 w-6 shrink-0 p-0"
                  onClick={() => onHeaderAliasRemove(original)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBulkRenameOpen(!bulkRenameOpen)}
        >
          <Replace className="size-3.5" />
          {bulkRenameOpen ? "Close bulk rename" : "Bulk rename"}
        </Button>

        {bulkRenameOpen ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="bulk-find" className="text-xs">
                  Find
                </Label>
                <Input
                  id="bulk-find"
                  placeholder="text to find"
                  value={bulkFind}
                  onChange={(e) => setBulkFind(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-replace" className="text-xs">
                  Replace
                </Label>
                <Input
                  id="bulk-replace"
                  placeholder="replacement"
                  value={bulkReplace}
                  onChange={(e) => setBulkReplace(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={bulkUseRegex}
                onChange={(e) => setBulkUseRegex(e.target.checked)}
                className="rounded border-border"
              />
              Use regex
            </label>
            {bulkPreviews.length > 0 ? (
              <div className="max-h-32 space-y-0.5 overflow-y-auto text-xs">
                <p className="font-medium text-muted-foreground">
                  Preview ({bulkPreviews.length} matches)
                </p>
                {bulkPreviews.map((p) => (
                  <div key={p.from} className="flex items-center gap-1.5 font-mono">
                    <span className="truncate text-muted-foreground">{p.from}</span>
                    <span className="shrink-0 text-muted-foreground">&rarr;</span>
                    <span className="truncate font-medium">{p.to}</span>
                  </div>
                ))}
              </div>
            ) : bulkFind ? (
              <p className="text-xs text-muted-foreground">No matches found.</p>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={bulkPreviews.length === 0}
              onClick={applyBulkRename}
            >
              Apply {bulkPreviews.length > 0 ? `(${bulkPreviews.length})` : ""}
            </Button>
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection
        description="Reorder columns by moving them up or down."
        title="Column order"
      >
        {headers.length === 0 ? (
          <Notice>Load data to see columns.</Notice>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {columnOrder.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onColumnOrderChange([]);
                    setSelectedForReorder(new Set());
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Reset order
                </Button>
              ) : null}
              {selectedForReorder.size > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveSelectedBulk("up")}
                  >
                    <ArrowUp className="size-3.5" />
                    Move up ({selectedForReorder.size})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveSelectedBulk("down")}
                  >
                    <ArrowDown className="size-3.5" />
                    Move down ({selectedForReorder.size})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedForReorder(new Set())}
                  >
                    Clear selection
                  </Button>
                </>
              ) : null}
            </div>
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {(columnOrder.length > 0 ? columnOrder : headers).map((header, index) => {
                const list = columnOrder.length > 0 ? columnOrder : headers;
                return (
                  <div
                    key={header}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selectedForReorder.has(header)}
                      onChange={(e) => {
                        setSelectedForReorder((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.add(header);
                          } else {
                            next.delete(header);
                          }
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">{header}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      title="Move to top"
                      disabled={index === 0}
                      onClick={() => moveColumnToEdge(header, "top")}
                    >
                      <ChevronsUp className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      disabled={index === 0}
                      onClick={() => moveColumn(header, "up")}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      disabled={index === list.length - 1}
                      onClick={() => moveColumn(header, "down")}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      title="Move to bottom"
                      disabled={index === list.length - 1}
                      onClick={() => moveColumnToEdge(header, "bottom")}
                    >
                      <ChevronsDown className="size-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </InspectorSection>

      <InspectorSection
        description="Hide columns from the preview and export."
        title="Column visibility"
      >
        {headers.length === 0 ? (
          <Notice>Load data to see columns.</Notice>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onHiddenColumnsChange(new Set())}
                disabled={hiddenColumns.size === 0}
              >
                <Eye className="size-3.5" />
                Show all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onHiddenColumnsChange(new Set(headers))}
                disabled={hiddenColumns.size === headers.length}
              >
                <EyeOff className="size-3.5" />
                Hide all
              </Button>
              {hiddenColumns.size > 0 ? (
                <span className="self-center text-xs text-muted-foreground">
                  {hiddenColumns.size} hidden
                </span>
              ) : null}
            </div>
            <Label htmlFor="visibility-filter" className="sr-only">
              Filter columns
            </Label>
            <Input
              id="visibility-filter"
              placeholder="Filter columns..."
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
            />
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {filteredVisibilityHeaders.map((header) => (
                <label
                  key={header}
                  className="flex items-center gap-2 rounded px-1.5 py-0.5 text-xs hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={!hiddenColumns.has(header)}
                    onChange={(e) => {
                      onHiddenColumnsChange(
                        (() => {
                          const next = new Set(hiddenColumns);
                          if (e.target.checked) {
                            next.delete(header);
                          } else {
                            next.add(header);
                          }
                          return next;
                        })(),
                      );
                    }}
                  />
                  <span className="min-w-0 truncate font-mono">{header}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </InspectorSection>
    </>
  );
}
