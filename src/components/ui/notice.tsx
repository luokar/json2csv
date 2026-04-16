import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type NoticeTone = "error" | "info" | "success" | "warning";

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: NoticeTone }) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-1 duration-200 rounded-lg border-l-2 px-3 py-2 text-sm",
        tone === "error" && "border-l-destructive bg-red-50 text-red-700",
        tone === "warning" && "border-l-amber-400 bg-amber-50 text-amber-800",
        tone === "success" && "border-l-emerald-500 bg-emerald-50 text-emerald-700",
        tone === "info" && "border-l-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
