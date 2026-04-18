import { X } from "lucide-react";

import { InspectorContextCard } from "@/components/inspector/inspector-context-card";
import { InspectorSection } from "@/components/inspector/inspector-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import type { ColumnSchema, ColumnTypeReport } from "@/lib/mapping-engine";
import type { ColumnProfile } from "@/lib/column-profiling";
import type { WorkbenchView } from "@/components/inspector/inspector-types";

export function InspectTabPanel({
  columnProfile,
  headerAlias,
  inspectorMode,
  onClearSelection,
  onHeaderAliasChange,
  selectedColumn,
  selectedColumnSchema,
  selectedColumnTypeReport,
  selectedRow,
}: {
  columnProfile: ColumnProfile | null;
  headerAlias: string | undefined;
  inspectorMode: "column" | "mapping" | "row";
  onClearSelection: () => void;
  onHeaderAliasChange: (original: string, alias: string) => void;
  selectedColumn: { header: string; view: WorkbenchView } | null;
  selectedColumnSchema: ColumnSchema | null;
  selectedColumnTypeReport: ColumnTypeReport | null;
  selectedRow: { label: string; row: Record<string, string>; view: WorkbenchView } | null;
}) {
  if (inspectorMode === "mapping") {
    return (
      <InspectorSection
        description="Select a row or column in the workbench to inspect it here."
        title="Inspector"
      >
        <Notice>
          Click a column header or a row in the data table to see details.
        </Notice>
      </InspectorSection>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {inspectorMode === "row" ? "Row details" : "Column details"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      </div>
      <InspectorContextCard
        inspectorMode={inspectorMode}
        selectedColumn={selectedColumn}
        selectedColumnSchema={selectedColumnSchema}
        selectedColumnTypeReport={selectedColumnTypeReport}
        selectedRow={selectedRow}
      />

      {inspectorMode === "column" && selectedColumn ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="column-display-name">Display name</Label>
            <Input
              id="column-display-name"
              placeholder={selectedColumn.header}
              defaultValue={headerAlias ?? ""}
              onBlur={(e) => {
                const value = e.target.value.trim();
                onHeaderAliasChange(selectedColumn.header, value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Rename this column in the exported CSV.
            </p>
          </div>

          {columnProfile ? (
            <div className="space-y-2 border-t border-border pt-3 text-xs">
              <p className="font-medium text-foreground">Profile</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empty</span>
                <span>
                  {columnProfile.emptyCount}/{columnProfile.totalRows} (
                  {columnProfile.emptyPercent.toFixed(0)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unique</span>
                <span>{columnProfile.uniqueCount.toLocaleString()}</span>
              </div>
              {columnProfile.numeric ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Range</span>
                    <span className="font-mono">
                      {columnProfile.numeric.min} &ndash; {columnProfile.numeric.max}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mean</span>
                    <span className="font-mono">
                      {columnProfile.numeric.mean.toFixed(2)}
                    </span>
                  </div>
                  {/* Histogram */}
                  {columnProfile.histogram && columnProfile.histogram.length > 0 ? (
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Distribution</p>
                      <div className="flex h-8 items-end gap-px">
                        {columnProfile.histogram.map((bin) => {
                          const maxCount = Math.max(
                            ...columnProfile.histogram!.map((b) => b.count),
                          );
                          const pct = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
                          return (
                            <div
                              key={bin.binStart}
                              className="flex-1 rounded-t bg-primary/60"
                              style={{ height: `${Math.max(pct, 2)}%` }}
                              title={`${bin.binStart}–${bin.binEnd}: ${bin.count}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              {columnProfile.topValues.length > 0 ? (
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">Top values</p>
                  {columnProfile.topValues.slice(0, 3).map((tv) => (
                    <div key={tv.value} className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate font-mono text-[11px]">
                        {tv.value}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {tv.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
