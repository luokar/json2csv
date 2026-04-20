import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { formatNum } from "@/components/workbench/column-profile-card";
import type { ColumnProfile } from "@/lib/column-profiling";

interface ColumnStatsPopoverProps {
  anchorPoint: { x: number; y: number };
  onClose: () => void;
  profile: ColumnProfile;
}

export function ColumnStatsPopover({ anchorPoint, onClose, profile }: ColumnStatsPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(anchorPoint);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = anchorPoint;
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }
    if (x !== anchorPoint.x || y !== anchorPoint.y) {
      setPosition({ x, y });
    }
  }, [anchorPoint]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const maxTopCount = profile.topValues.length > 0 ? profile.topValues[0]!.count : 1;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{profile.header}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {profile.dominantKind ? (
            <Badge variant="outline" className="text-[10px]">{profile.dominantKind}</Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-2.5 text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
          <span>Total rows</span>
          <span className="text-right font-medium text-foreground">{profile.totalRows.toLocaleString()}</span>
          <span>Empty</span>
          <span className="text-right font-medium text-foreground">
            {profile.emptyCount.toLocaleString()} ({profile.emptyPercent.toFixed(0)}%)
          </span>
          <span>Unique</span>
          <span className="text-right font-medium text-foreground">{profile.uniqueCount.toLocaleString()}</span>
          <span>Cardinality</span>
          <span className="text-right font-medium text-foreground">{(profile.cardinalityRatio * 100).toFixed(1)}%</span>
        </div>

        {profile.numeric ? (
          <>
            <div className="h-px bg-border" />
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
          </>
        ) : null}

        {profile.topValues.length > 0 ? (
          <>
            <div className="h-px bg-border" />
            <div className="space-y-1">
              <p className="text-muted-foreground">Top values</p>
              {profile.topValues.slice(0, 5).map((tv) => (
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
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
