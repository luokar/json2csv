import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { formatNum } from "@/components/workbench/column-profile-card";
import type { ColumnProfile } from "@/lib/column-profiling";

interface ColumnStatsPanelProps {
  profiles: ColumnProfile[];
  onClose: () => void;
  initialColumnId?: string;
  onApplyColumnFilter?: (columnId: string, value: string) => void;
}

export function ColumnStatsPanel({ profiles, onClose, initialColumnId, onApplyColumnFilter }: ColumnStatsPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialColumnId ?? profiles[0]?.header ?? null,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.header.toLowerCase().includes(q));
  }, [profiles, search]);

  const selected = useMemo(
    () => profiles.find((p) => p.header === selectedId) ?? filtered[0] ?? null,
    [profiles, selectedId, filtered],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="flex h-[min(720px,90vh)] w-[min(960px,95vw)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Column statistics</h2>
            <p className="text-xs text-muted-foreground">
              {profiles.length.toLocaleString()} column{profiles.length === 1 ? "" : "s"} profiled
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left rail */}
          <div className="flex w-64 shrink-0 flex-col border-r border-border">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search columns"
                  className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto p-1">
              {filtered.map((p) => {
                const isActive = selected?.header === p.header;
                return (
                  <li key={p.header}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.header)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                    >
                      <span className="min-w-0 truncate font-medium">{p.header}</span>
                      {p.dominantKind ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {p.dominantKind}
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching columns
                </li>
              ) : null}
            </ul>
          </div>

          {/* Detail pane */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {selected ? (
              <ColumnStatsDetail
                profile={selected}
                onApplyFilter={
                  onApplyColumnFilter
                    ? (value) => {
                        onApplyColumnFilter(selected.header, value);
                        onClose();
                      }
                    : undefined
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a column to view its statistics.</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ColumnStatsDetail({ profile, onApplyFilter }: { profile: ColumnProfile; onApplyFilter?: (value: string) => void }) {
  const maxTopCount = profile.topValues.length > 0 ? profile.topValues[0]!.count : 1;
  const maxHistCount = profile.histogram?.reduce((m, b) => Math.max(m, b.count), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 truncate text-lg font-semibold">{profile.header}</h3>
        {profile.dominantKind ? (
          <Badge variant="outline">{profile.dominantKind}</Badge>
        ) : null}
        <Badge variant="secondary" className="text-[10px]">{profile.nullPattern} nulls</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Total rows" value={profile.totalRows.toLocaleString()} />
        <StatCard
          label="Empty"
          value={`${profile.emptyCount.toLocaleString()} (${profile.emptyPercent.toFixed(0)}%)`}
        />
        <StatCard label="Unique" value={profile.uniqueCount.toLocaleString()} />
        <StatCard label="Cardinality" value={`${(profile.cardinalityRatio * 100).toFixed(1)}%`} />
      </div>

      {profile.numeric ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Numeric</h4>
          <div className="grid grid-cols-4 divide-x divide-border rounded border border-border bg-muted/40 text-center">
            <NumericCell label="Min" value={profile.numeric.min} />
            <NumericCell label="Max" value={profile.numeric.max} />
            <NumericCell label="Mean" value={profile.numeric.mean} />
            <NumericCell label="Median" value={profile.numeric.median} />
          </div>
          {profile.histogram && profile.histogram.length > 0 ? (
            <div className="rounded border border-border p-2">
              <p className="mb-1 text-[10px] text-muted-foreground">Distribution</p>
              <div className="flex h-20 items-end gap-px">
                {profile.histogram.map((bin, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-primary/40"
                    style={{ height: `${maxHistCount > 0 ? (bin.count / maxHistCount) * 100 : 0}%` }}
                    title={`${formatNum(bin.binStart)}–${formatNum(bin.binEnd)}: ${bin.count}`}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {profile.stringLength ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">String length</h4>
          <div className="grid grid-cols-3 divide-x divide-border rounded border border-border bg-muted/40 text-center">
            <NumericCell label="Min" value={profile.stringLength.min} />
            <NumericCell label="Avg" value={profile.stringLength.avg} />
            <NumericCell label="Max" value={profile.stringLength.max} />
          </div>
        </section>
      ) : null}

      {profile.topValues.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Top values
          </h4>
          <div className="space-y-1.5">
            {profile.topValues.slice(0, 10).map((tv) => {
              const content = (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 truncate font-mono">{tv.value || <em className="text-muted-foreground">(empty)</em>}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {tv.count.toLocaleString()} ({tv.percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary/40"
                      style={{ width: `${(tv.count / maxTopCount) * 100}%` }}
                    />
                  </div>
                </>
              );
              return onApplyFilter ? (
                <button
                  key={tv.value}
                  type="button"
                  onClick={() => onApplyFilter(tv.value)}
                  title={`Filter ${profile.header} by "${tv.value}"`}
                  className="block w-full space-y-0.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent/50"
                >
                  {content}
                </button>
              ) : (
                <div key={tv.value} className="space-y-0.5">{content}</div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function NumericCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-mono text-xs font-medium">{formatNum(value)}</p>
    </div>
  );
}
