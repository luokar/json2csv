import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import type { ColumnSchema, ColumnTypeReport } from "@/lib/mapping-engine";
import type { WorkbenchView } from "./inspector-types";

export function InspectorContextCard({
  inspectorMode,
  selectedColumn,
  selectedColumnSchema,
  selectedColumnTypeReport,
  selectedRow,
}: {
  inspectorMode: "column" | "mapping" | "row";
  selectedColumn: { header: string; view: WorkbenchView } | null;
  selectedColumnSchema: ColumnSchema | null;
  selectedColumnTypeReport: ColumnTypeReport | null;
  selectedRow: { label: string; row: Record<string, string>; view: WorkbenchView } | null;
}) {
  if (inspectorMode === "row" && selectedRow) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Row inspector</CardTitle>
          <CardDescription>
            {selectedRow.label} from the {selectedRow.view} workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {Object.entries(selectedRow.row)
            .slice(0, 12)
            .map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2"
              >
                <span className="truncate font-mono text-[11px] text-muted-foreground">{key}</span>
                <span className="truncate text-sm text-foreground">{value || "\u00A0"}</span>
              </div>
            ))}
        </CardContent>
      </Card>
    );
  }

  if (inspectorMode === "column" && selectedColumn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Column inspector</CardTitle>
          <CardDescription>
            {selectedColumn.header} from the {selectedColumn.view} workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {selectedColumnSchema ? (
            <>
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Source path
                </p>
                <p className="mt-1 font-mono text-[12px] text-foreground">
                  {selectedColumnSchema.sourcePath}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedColumnSchema.kinds.map((kind) => (
                  <Badge key={`${selectedColumn.header}-${kind}`} variant="secondary">
                    {kind}
                  </Badge>
                ))}
                <Badge variant="outline">
                  {selectedColumnSchema.nullable ? "Nullable" : "Required"}
                </Badge>
              </div>
            </>
          ) : (
            <Notice>No schema metadata is available for the selected column.</Notice>
          )}
          {selectedColumnTypeReport ? (
            <Notice>{formatTypeReport(selectedColumnTypeReport)}</Notice>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapping inspector</CardTitle>
        <CardDescription>
          Use the sections below to steer the current projection without leaving the workspace.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function formatTypeReport(report: ColumnTypeReport) {
  return report.typeBreakdown
    .map((entry) => `${formatPercent(entry.percentage)} ${entry.kind}`)
    .join(" / ");
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}
