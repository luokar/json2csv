import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollapsibleSidebar({
  children,
  isOpen,
  onToggle,
  tabStrip,
}: {
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  tabStrip?: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "relative flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-200 ease-in-out",
        isOpen ? "w-[448px] min-w-[448px] opacity-100" : "w-0 min-w-0 opacity-0",
      )}
    >
      <div className="absolute top-3 -left-10 z-30">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 rounded-lg shadow-sm"
          onClick={onToggle}
          title={isOpen ? "Collapse sidebar (⌘B)" : "Expand sidebar (⌘B)"}
        >
          {isOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
        </Button>
      </div>

      <div className="flex h-full min-w-[448px] flex-row">
        {tabStrip}
        <div className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </aside>
  );
}

export function SidebarToggleButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      onClick={onToggle}
      title={isOpen ? "Collapse sidebar (⌘B)" : "Expand sidebar (⌘B)"}
    >
      {isOpen ? (
        <PanelRightClose className="size-4" />
      ) : (
        <PanelRightOpen className="size-4" />
      )}
    </Button>
  );
}
