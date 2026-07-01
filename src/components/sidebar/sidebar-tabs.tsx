import { BarChart3, Database, Download, Search, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SidebarTab } from "@/components/inspector/inspector-types";

const tabs: Array<{ icon: typeof Database; id: SidebarTab; label: string }> = [
  { icon: Database, id: "data", label: "Data" },
  { icon: SlidersHorizontal, id: "transform", label: "Transform" },
  { icon: BarChart3, id: "profile", label: "Profile" },
  { icon: Download, id: "export", label: "Export" },
  { icon: Search, id: "inspect", label: "Inspect" },
];

export function SidebarTabs({
  activeTab,
  inspectIndicator,
  onTabChange,
}: {
  activeTab: SidebarTab;
  inspectIndicator: boolean;
  onTabChange: (tab: SidebarTab) => void;
}) {
  return (
    <nav className="flex w-16 flex-shrink-0 flex-col gap-1 border-r border-border bg-muted/40 py-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center gap-1 border-l-2 px-1.5 py-2 font-mono transition-colors duration-100",
              isActive
                ? "border-primary bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:bg-background hover:text-foreground",
            )}
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
          >
            <Icon className="size-[18px]" strokeWidth={1.6} />
            <span className="text-[10px] font-normal leading-tight">{tab.label}</span>
            {tab.id === "inspect" && inspectIndicator ? (
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
