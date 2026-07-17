import { ArrowRight, TableProperties } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TablePlan } from "@/lib/table-planner";

export function TablePlanList({
  onApply,
  plans,
}: {
  onApply: (plan: TablePlan) => void;
  plans: TablePlan[];
}) {
  if (plans.length === 0) {
    return null;
  }

  return (
    <div aria-label="Detected table plans" className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <TableProperties className="size-4 text-primary" />
        {plans.length.toLocaleString()} table option{plans.length === 1 ? "" : "s"}
      </div>

      {plans.map((plan) => (
        <article
          key={plan.id}
          className="space-y-2 rounded-lg border border-border bg-card p-3 shadow-geist"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground" title={plan.label}>
                {plan.label}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {plan.estimatedRows.toLocaleString()} rows · about{" "}
                {plan.estimatedColumns.toLocaleString()} columns
              </p>
            </div>
            <Button
              aria-label={`Use ${plan.label}`}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onApply(plan)}
            >
              Use
              <ArrowRight />
            </Button>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">{plan.summary}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={plan.rootPath}>
            {plan.rootPath}
          </p>

          {plan.previewHeaders.length > 0 ? (
            <p className="line-clamp-2 font-mono text-[11px] leading-4 text-muted-foreground">
              {plan.previewHeaders.join(", ")}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
