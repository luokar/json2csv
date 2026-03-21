import { Command, CornerDownLeft } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface CommandPaletteAction {
  description: string;
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  keywords?: string[];
  label: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  actions: CommandPaletteAction[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CommandPalette({ actions, onOpenChange, open }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  const visibleActions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return actions;
    }

    return actions.filter((action) => {
      const haystack = [action.label, action.description, ...(action.keywords ?? [])].join(" ");

      return haystack.toLowerCase().includes(normalized);
    });
  }, [actions, query]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/15 px-4 py-[12vh] backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
        <div className="border-b border-border/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <Command className="size-4 text-primary" />
            <Input
              autoFocus
              aria-label="Command palette"
              className="border-transparent bg-transparent px-0 shadow-none focus-visible:ring-0"
              placeholder="Jump to a view, switch source, or run an export"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Badge variant="outline">Esc</Badge>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {visibleActions.length > 0 ? (
            visibleActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-left transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={action.disabled}
                onClick={() => {
                  action.onSelect();
                  onOpenChange(false);
                }}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 text-primary">
                    {action.icon ?? <Command className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <CornerDownLeft className="size-3.5 text-muted-foreground" />
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No actions match the current query.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
