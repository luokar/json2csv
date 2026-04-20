import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ColumnProfile } from "@/lib/column-profiling";
import { cn } from "@/lib/utils";

function cardinalityLabel(ratio: number): string {
  if (ratio >= 0.95) return "Identifier";
  if (ratio <= 0.1) return "Categorical";
  return "Mixed";
}

function cardinalityVariant(ratio: number): "default" | "outline" | "secondary" {
  if (ratio >= 0.95) return "default";
  if (ratio <= 0.1) return "secondary";
  return "outline";
}

function typeAccentBorder(kind: string | null): string {
  switch (kind) {
    case "string":
      return "border-l-2 border-l-blue-400";
    case "number":
      return "border-l-2 border-l-emerald-400";
    case "boolean":
      return "border-l-2 border-l-purple-400";
    default:
      return "border-l-2 border-l-gray-300";
  }
}

export function ColumnProfileCard({
  onClick,
  profile,
}: {
  onClick?: () => void;
  profile: ColumnProfile;
}) {
  const emptyBar = profile.emptyPercent;
  const maxTopCount = profile.topValues.length > 0 ? profile.topValues[0]!.count : 1;

  return (
    <Card
      className={cn(
        typeAccentBorder(profile.dominantKind),
        onClick ? "cursor-pointer transition-colors hover:bg-accent/50" : undefined,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-sm">{profile.header}</CardTitle>
          <div className="flex items-center gap-1">
            {profile.dominantKind ? (
              <Badge variant="outline" className="text-[10px]">
                {profile.dominantKind}
              </Badge>
            ) : null}
            <Badge
              variant={cardinalityVariant(profile.cardinalityRatio)}
              className="text-[10px]"
            >
              {cardinalityLabel(profile.cardinalityRatio)}
            </Badge>
          </div>
        </div>
        {profile.sourcePath !== profile.header ? (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {profile.sourcePath}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {/* Empty bar + null pattern */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              Empty
              {profile.nullPattern !== "none" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[9px] font-medium",
                    profile.nullPattern === "sparse" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
                    profile.nullPattern === "moderate" && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                    profile.nullPattern === "heavy" && "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
                    profile.nullPattern === "all" && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
                  )}
                >
                  {profile.nullPattern === "sparse"
                    ? "Sparse nulls"
                    : profile.nullPattern === "moderate"
                      ? "Some nulls"
                      : profile.nullPattern === "heavy"
                        ? "Many nulls"
                        : "All null"}
                </span>
              ) : null}
            </span>
            <span>
              {profile.emptyCount}/{profile.totalRows} ({emptyBar.toFixed(0)}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-orange-300 to-orange-500"
              style={{ width: `${Math.min(emptyBar, 100)}%` }}
            />
          </div>
        </div>

        {/* Unique count */}
        <div className="flex justify-between text-muted-foreground">
          <span>Unique values</span>
          <span>{profile.uniqueCount.toLocaleString()}</span>
        </div>

        {/* Numeric stats */}
        {profile.numeric ? (
          <div className="grid grid-cols-4 divide-x divide-border rounded border border-border bg-muted/40 text-center">
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Min</p>
              <p className="font-mono text-[11px] font-medium">{formatNum(profile.numeric.min)}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Max</p>
              <p className="font-mono text-[11px] font-medium">{formatNum(profile.numeric.max)}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Mean</p>
              <p className="font-mono text-[11px] font-medium">{formatNum(profile.numeric.mean)}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Median</p>
              <p className="font-mono text-[11px] font-medium">{formatNum(profile.numeric.median)}</p>
            </div>
          </div>
        ) : null}

        {/* Histogram */}
        {profile.histogram && profile.histogram.length > 0 ? (
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Distribution</p>
            <div className="flex h-10 items-end gap-px">
              {profile.histogram.map((bin) => {
                const maxCount = Math.max(...profile.histogram!.map((b) => b.count));
                const pct = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
                return (
                  <div
                    key={bin.binStart}
                    className="flex-1 rounded-t bg-primary/60"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                    title={`${formatNum(bin.binStart)}–${formatNum(bin.binEnd)}: ${bin.count}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>{formatNum(profile.histogram[0]!.binStart)}</span>
              <span>{formatNum(profile.histogram[profile.histogram.length - 1]!.binEnd)}</span>
            </div>
          </div>
        ) : null}

        {/* String length stats */}
        {profile.stringLength && !profile.numeric ? (
          <div className="grid grid-cols-3 divide-x divide-border rounded border border-border bg-muted/40 text-center">
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Min len</p>
              <p className="font-mono text-[11px] font-medium">{profile.stringLength.min}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Max len</p>
              <p className="font-mono text-[11px] font-medium">{profile.stringLength.max}</p>
            </div>
            <div className="px-1.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">Avg len</p>
              <p className="font-mono text-[11px] font-medium">{profile.stringLength.avg.toFixed(1)}</p>
            </div>
          </div>
        ) : null}

        {/* Top values with inline frequency bars */}
        {profile.topValues.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted-foreground">Top values</p>
            {profile.topValues.map((tv) => (
              <div key={tv.value} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-[11px]">{tv.value}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {tv.count} ({tv.percent.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-primary/40"
                    style={{ width: `${(tv.count / maxTopCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
