import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import type { ColumnSchema, ColumnTypeReport } from "@/lib/mapping-engine";
import type { ProjectionConversionResult } from "@/lib/projection";

const schemaColumnPreviewLimit = 120;
const schemaTypeReportPreviewLimit = 40;

export function SchemaWorkbenchPanel({
  conversionResult,
  hiddenMixedTypeReportCount,
  hiddenSchemaColumnCount,
  onInspectColumn,
  visibleMixedTypeReports,
  visibleSchemaColumns,
}: {
  conversionResult: ProjectionConversionResult | null;
  hiddenMixedTypeReportCount: number;
  hiddenSchemaColumnCount: number;
  onInspectColumn: (header: string) => void;
  visibleMixedTypeReports: ColumnTypeReport[];
  visibleSchemaColumns: ColumnSchema[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          Column details
        </CardTitle>
        <CardDescription>
          See every column, its data source, and what types of values it contains.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            ID columns
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {conversionResult?.schema.primaryKeys.map((key) => (
              <Badge key={key} variant="outline">
                {key}
              </Badge>
            ))}
            {(conversionResult?.schema.primaryKeys.length ?? 0) === 0 ? (
              <span className="text-sm text-muted-foreground">No ID columns found.</span>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Mixed data types
          </p>
          {hiddenMixedTypeReportCount > 0 ? (
            <Notice>
              Showing the first {schemaTypeReportPreviewLimit.toLocaleString()} mixed-type columns.
              {` ${hiddenMixedTypeReportCount} more are not shown in this preview.`}
            </Notice>
          ) : null}
          {visibleMixedTypeReports.length > 0 ? (
            <div className="mt-3 space-y-2">
              {visibleMixedTypeReports.map((report) => (
                <button
                  key={report.header}
                  type="button"
                  className="block w-full rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors duration-100 hover:bg-muted/50"
                  onClick={() => onInspectColumn(report.header)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{report.header}</span>
                    {report.coercedTo ? (
                      <Badge variant="secondary">Converted to {report.coercedTo}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {formatTypeReport(report)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No mixed-type columns detected in this conversion.
            </p>
          )}
        </div>

        {hiddenSchemaColumnCount > 0 ? (
          <Notice>
            Showing the first {schemaColumnPreviewLimit.toLocaleString()} columns in this preview.
            {` ${hiddenSchemaColumnCount} additional columns will appear in the full download.`}
          </Notice>
        ) : null}

        <div className="grid gap-2">
          {visibleSchemaColumns.map((column) => (
            <button
              key={column.header}
              type="button"
              className="rounded-lg border border-border bg-card p-4 text-left transition-colors duration-100 hover:bg-muted/50"
              onClick={() => onInspectColumn(column.header)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{column.header}</p>
                <div className="flex flex-wrap gap-1.5">
                  {column.kinds.map((kind) => (
                    <Badge key={`${column.header}-${kind}`} variant="secondary">
                      {kind}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{column.sourcePath}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {column.nullable ? "Can be empty" : "Always present"}
              </p>
            </button>
          ))}
        </div>
      </CardContent>
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
