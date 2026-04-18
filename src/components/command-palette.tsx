import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  Clipboard,
  Database,
  Download,
  Eye,
  FileDown,
  FileText,
  Keyboard,
  Layers,
  Redo2,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export interface CommandAction {
  category?: string;
  icon: React.ReactNode;
  id: string;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}

export function CommandPalette({
  actions,
  isOpen,
  onOpenChange,
}: {
  actions: CommandAction[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredActions = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return actions;
    }

    return actions.filter((action) => action.label.toLowerCase().includes(normalized));
  }, [actions, search]);

  // Reset activeIndex when search changes or list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search, filteredActions.length]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (filteredActions.length === 0) return;
    const activeAction = filteredActions[activeIndex];
    if (!activeAction) return;
    const el = document.getElementById(`cmd-${activeAction.id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filteredActions]);

  function handleSelect(action: CommandAction) {
    onOpenChange(false);
    setSearch("");
    action.onSelect();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filteredActions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        if (filteredActions.length > 0 && filteredActions[activeIndex]) {
          handleSelect(filteredActions[activeIndex]);
        }
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(Math.max(0, filteredActions.length - 1));
        break;
    }
  }

  // Group actions by category for rendering
  const groupedItems = useMemo(() => {
    const items: Array<
      | { type: "header"; label: string }
      | { type: "action"; action: CommandAction; flatIndex: number }
    > = [];
    let lastCategory: string | undefined;
    filteredActions.forEach((action, flatIndex) => {
      if (action.category && action.category !== lastCategory) {
        items.push({ type: "header", label: action.category });
        lastCategory = action.category;
      }
      items.push({ type: "action", action, flatIndex });
    });
    return items;
  }, [filteredActions]);

  const activeAction = filteredActions[activeIndex];

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in fade-in duration-150" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="command-listbox"
                aria-activedescendant={activeAction ? `cmd-${activeAction.id}` : undefined}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Search for an action..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Kbd>esc</Kbd>
            </div>

            <div
              ref={listRef}
              id="command-listbox"
              role="listbox"
              className="max-h-72 overflow-y-auto p-1.5"
            >
              {filteredActions.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matching actions.
                </p>
              ) : (
                groupedItems.map((item) => {
                  if (item.type === "header") {
                    return (
                      <div
                        key={`header-${item.label}`}
                        role="presentation"
                        className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {item.label}
                      </div>
                    );
                  }

                  const { action, flatIndex } = item;
                  const isActive = flatIndex === activeIndex;

                  return (
                    <button
                      key={action.id}
                      id={`cmd-${action.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors duration-100",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                      )}
                      onClick={() => handleSelect(action)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                    >
                      <span className="text-muted-foreground">{action.icon}</span>
                      <span className="flex-1 text-left">{action.label}</span>
                      {action.shortcut ? <Kbd>{action.shortcut}</Kbd> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function createDefaultActions({
  onCopyJqSnippet,
  onCopySqlSnippet,
  onDownloadCsv,
  onExportConfig,
  onRedo,
  onResetDefaults,
  onShowShortcutsHelp,
  onSmartDetect,
  onSwitchView,
  onToggleSidebar,
  onUndo,
  onViewProfiles,
}: {
  onCopyJqSnippet: () => void;
  onCopySqlSnippet: () => void;
  onDownloadCsv: () => void;
  onExportConfig: () => void;
  onRedo: () => void;
  onResetDefaults: () => void;
  onShowShortcutsHelp: () => void;
  onSmartDetect: () => void;
  onSwitchView: (view: "csv" | "flat" | "schema") => void;
  onToggleSidebar: () => void;
  onUndo: () => void;
  onViewProfiles: () => void;
}): CommandAction[] {
  return [
    {
      category: "Download",
      icon: <Download className="size-4" />,
      id: "download-csv",
      label: "Download CSV",
      onSelect: onDownloadCsv,
      shortcut: "⌘D",
    },
    {
      category: "View",
      icon: <Eye className="size-4" />,
      id: "toggle-sidebar",
      label: "Show/hide settings",
      onSelect: onToggleSidebar,
      shortcut: "⌘B",
    },
    {
      icon: <Table2 className="size-4" />,
      id: "view-flat",
      label: "Switch to Table view",
      onSelect: () => onSwitchView("flat"),
    },
    {
      icon: <FileText className="size-4" />,
      id: "view-csv",
      label: "Switch to CSV preview",
      onSelect: () => onSwitchView("csv"),
    },
    {
      icon: <Layers className="size-4" />,
      id: "view-schema",
      label: "Switch to Column details",
      onSelect: () => onSwitchView("schema"),
    },
    {
      icon: <BarChart3 className="size-4" />,
      id: "view-profiles",
      label: "View column profiles",
      onSelect: onViewProfiles,
    },
    {
      icon: <Keyboard className="size-4" />,
      id: "keyboard-shortcuts",
      label: "Keyboard shortcuts",
      onSelect: onShowShortcutsHelp,
      shortcut: "?",
    },
    {
      category: "Tools",
      icon: <Undo2 className="size-4" />,
      id: "undo",
      label: "Undo column change",
      onSelect: onUndo,
      shortcut: "⌘Z",
    },
    {
      icon: <Redo2 className="size-4" />,
      id: "redo",
      label: "Redo column change",
      onSelect: onRedo,
      shortcut: "⌘⇧Z",
    },
    {
      icon: <Sparkles className="size-4" />,
      id: "smart-detect",
      label: "Auto-detect rows",
      onSelect: onSmartDetect,
    },
    {
      icon: <RotateCcw className="size-4" />,
      id: "reset-defaults",
      label: "Start over",
      onSelect: onResetDefaults,
    },
    {
      icon: <FileDown className="size-4" />,
      id: "export-config",
      label: "Save config as JSON",
      onSelect: onExportConfig,
    },
    {
      icon: <Clipboard className="size-4" />,
      id: "copy-jq",
      label: "Copy jq snippet",
      onSelect: onCopyJqSnippet,
    },
    {
      icon: <Database className="size-4" />,
      id: "copy-sql",
      label: "Copy SQL schema",
      onSelect: onCopySqlSnippet,
    },
  ];
}
