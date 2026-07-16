import { cn } from "@/lib/utils";

export function WorkbenchNavButton({
  active,
  disabled = false,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-[5px] border border-transparent px-4 text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-card text-primary font-medium shadow-geist"
          : "text-muted-foreground hover:text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{meta}</span>
    </button>
  );
}
