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
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs text-muted-foreground">
      <span className="font-medium">{label}</span>
      <span className={cn("text-foreground", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}
