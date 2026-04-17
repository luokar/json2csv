import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { InspectorSection } from "@/components/inspector/inspector-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { ColumnProfileCard } from "@/components/workbench/column-profile-card";
import type { ColumnProfile } from "@/lib/column-profiling";

export function ProfileTabPanel({
  columnProfiles,
  onInspectColumn,
  sampleRowCount,
}: {
  columnProfiles: ColumnProfile[];
  onInspectColumn?: (header: string) => void;
  sampleRowCount: number;
}) {
  const [filter, setFilter] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);

  if (columnProfiles.length === 0) {
    return (
      <InspectorSection
        description="Statistical summary of each column in the preview."
        title="Column profiles"
      >
        <Notice>
          Load data and run a conversion to see column profiles.
        </Notice>
      </InspectorSection>
    );
  }

  const highEmptyCount = columnProfiles.filter((p) => p.emptyPercent > 50).length;
  const mixedTypeCount = columnProfiles.filter((p) => p.dominantKind === null).length;

  const filteredProfiles = columnProfiles.filter((profile) => {
    if (filter && !profile.header.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }

    if (issuesOnly && profile.emptyPercent < 10 && profile.dominantKind !== null) {
      return false;
    }

    return true;
  });

  return (
    <InspectorSection
      description="Statistical summary of each column in the preview."
      title="Column profiles"
    >
      <p className="text-xs text-muted-foreground">
        {columnProfiles.length} columns profiled from {sampleRowCount.toLocaleString()} sample rows.
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{columnProfiles.length} columns</Badge>
        {highEmptyCount > 0 ? (
          <Badge variant="outline" className="border-orange-300 text-orange-600">
            {highEmptyCount} high empty
          </Badge>
        ) : null}
        {mixedTypeCount > 0 ? (
          <Badge variant="outline" className="border-amber-300 text-amber-600">
            {mixedTypeCount} mixed type
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profile-filter" className="sr-only">
          Filter columns
        </Label>
        <Input
          id="profile-filter"
          placeholder="Filter columns..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={issuesOnly}
          onChange={(e) => setIssuesOnly(e.target.checked)}
          className="rounded border-border"
        />
        Show only columns with issues
      </label>

      {filteredProfiles.length === 0 ? (
        <Notice>No columns match the current filters.</Notice>
      ) : (
        <div className="space-y-2">
          {filteredProfiles.map((profile) => (
            <ColumnProfileCard
              key={profile.header}
              profile={profile}
              onClick={onInspectColumn ? () => onInspectColumn(profile.header) : undefined}
            />
          ))}
        </div>
      )}
    </InspectorSection>
  );
}
