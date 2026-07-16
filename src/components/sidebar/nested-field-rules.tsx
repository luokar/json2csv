import { useMemo, useState } from "react";

import { InspectorSection } from "@/components/inspector/inspector-section";
import { controlSelectClassName } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import type { InspectedPath } from "@/lib/mapping-engine";

export type NestedFieldStyle = "flatten" | "stringify";

const visiblePathLimit = 40;

const ruleOptions = [
  { label: "Inherit depth style", value: "inherit" },
  { label: "Flatten into columns", value: "flatten" },
  { label: "Stringify as JSON", value: "stringify" },
] as const;

export function NestedFieldRules({
  inspectedPaths,
  onRuleChange,
  rules,
}: {
  inspectedPaths: InspectedPath[];
  onRuleChange: (path: string, style: NestedFieldStyle | null) => void;
  rules: Record<string, NestedFieldStyle>;
}) {
  const [filter, setFilter] = useState("");
  const containerPaths = useMemo(() => {
    const pathsByName = new Map(
      inspectedPaths
        .filter((entry) => entry.kinds.includes("array") || entry.kinds.includes("object"))
        .map((entry) => [entry.path, entry]),
    );

    for (const path of Object.keys(rules)) {
      if (!pathsByName.has(path)) {
        pathsByName.set(path, {
          count: 0,
          depth: path.split(".").length,
          kinds: [],
          path,
        });
      }
    }

    return [...pathsByName.values()].sort(
      (left, right) => left.depth - right.depth || left.path.localeCompare(right.path),
    );
  }, [inspectedPaths, rules]);
  const normalizedFilter = filter.trim().toLowerCase();
  const matchingPaths = normalizedFilter
    ? containerPaths.filter((entry) => entry.path.toLowerCase().includes(normalizedFilter))
    : containerPaths;
  const visiblePaths = matchingPaths.slice(0, visiblePathLimit);

  return (
    <InspectorSection
      description="Override the depth style for individual object or list fields."
      title="Nested field rules"
    >
      {containerPaths.length === 0 ? (
        <Notice>Load nested data to configure individual field rules.</Notice>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="nested-field-filter">Filter nested fields</Label>
            <Input
              id="nested-field-filter"
              placeholder="creator, metrics…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            {visiblePaths.map((entry) => {
              const selectedStyle = rules[entry.path] ?? "inherit";
              const kindLabel = entry.kinds.length > 0 ? entry.kinds.join(" / ") : "saved rule";
              const countLabel = entry.count > 0 ? `${entry.count.toLocaleString()} values` : null;

              return (
                <div
                  key={entry.path}
                  className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium" title={entry.path}>
                      {entry.path}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {kindLabel}
                      {countLabel ? ` · ${countLabel}` : ""}
                    </p>
                  </div>
                  <select
                    aria-label={`Nesting rule for ${entry.path}`}
                    className={controlSelectClassName}
                    value={selectedStyle}
                    onChange={(event) => {
                      const value = event.target.value;
                      onRuleChange(
                        entry.path,
                        value === "inherit" ? null : (value as NestedFieldStyle),
                      );
                    }}
                  >
                    {ruleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {matchingPaths.length === 0 ? (
            <Notice>No nested fields match this filter.</Notice>
          ) : matchingPaths.length > visiblePathLimit ? (
            <Notice>
              Showing the first {visiblePathLimit} matching fields. Narrow the filter to find more.
            </Notice>
          ) : null}
        </>
      )}
    </InspectorSection>
  );
}
