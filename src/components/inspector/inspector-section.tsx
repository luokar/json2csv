import type { ReactNode } from "react";

export function InspectorSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3 border-t border-border px-4 py-3">{children}</div>
    </section>
  );
}
