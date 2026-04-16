import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollapsibleSidebar({
  children,
  isOpen,
  onToggle,
}: {
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "relative flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-200 ease-in-out",
        isOpen ? "w-[400px] min-w-[400px] opacity-100" : "w-0 min-w-0 opacity-0",
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

      <div className="flex h-full min-w-[400px] flex-col">
        {children}
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
