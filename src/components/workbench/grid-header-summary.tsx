import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

interface GridHeaderSummaryProps {
  title: string;
  description: string;
  rowCount: number;
  visibleColumnCount: number;
  hiddenColumnCount: number;
  summaryBadges?: ReactNode;
}

/**
 * Top section of the data grid: title, row/column count badges, description,
 * and a slot for caller-supplied summary badges.
 */
export function GridHeaderSummary({
  title,
  description,
  rowCount,
  visibleColumnCount,
  hiddenColumnCount,
  summaryBadges,
}: GridHeaderSummaryProps) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <Badge variant="outline">{rowCount.toLocaleString()} rows</Badge>
          <Badge variant="secondary">{visibleColumnCount} columns shown</Badge>
          {hiddenColumnCount > 0 ? (
            <Badge variant="outline">{hiddenColumnCount} hidden</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">{summaryBadges}</div>
    </div>
  );
}
