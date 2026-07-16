import { cn } from "@/lib/utils";

export function WorkbenchMetric({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="inline-flex h-8 items-center gap-2 border-y border-l border-border bg-card px-3 text-xs text-muted-foreground first:rounded-l-md last:rounded-r-md last:border-r">
      <span>{label}</span>
      <span className={cn("font-mono text-foreground", mono && "text-[11px]")}>{value}</span>
    </div>
  );
}
