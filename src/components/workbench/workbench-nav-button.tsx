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
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-primary/20 bg-accent text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{meta}</span>
    </button>
  );
}
