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
    <section className="border-b border-border bg-background last:border-b-0">
      <div className="px-5 py-4">
        <h2 className="font-mono text-sm font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-4 px-5 pb-5">{children}</div>
    </section>
  );
}
