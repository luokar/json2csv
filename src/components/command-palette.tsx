import * as Dialog from "@radix-ui/react-dialog";
import {
  Download,
  Eye,
  FileText,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Kbd } from "@/components/ui/kbd";

export interface CommandAction {
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

  const filteredActions = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return actions;
    }

    return actions.filter((action) => action.label.toLowerCase().includes(normalized));
  }, [actions, search]);

  function handleSelect(action: CommandAction) {
    onOpenChange(false);
    setSearch("");
    action.onSelect();
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in fade-in duration-150" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Type a command..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredActions.length > 0) {
                    handleSelect(filteredActions[0]);
                  }
                }}
              />
              <Kbd>esc</Kbd>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {filteredActions.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matching commands.
                </p>
              ) : (
                filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors duration-100 hover:bg-muted"
                    onClick={() => handleSelect(action)}
                  >
                    <span className="text-muted-foreground">{action.icon}</span>
                    <span className="flex-1 text-left">{action.label}</span>
                    {action.shortcut ? <Kbd>{action.shortcut}</Kbd> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function createDefaultActions({
  onDownloadCsv,
  onResetDefaults,
  onSmartDetect,
  onSwitchView,
  onToggleSidebar,
}: {
  onDownloadCsv: () => void;
  onResetDefaults: () => void;
  onSmartDetect: () => void;
  onSwitchView: (view: "csv" | "flat" | "schema") => void;
  onToggleSidebar: () => void;
}): CommandAction[] {
  return [
    {
      icon: <Download className="size-4" />,
      id: "download-csv",
      label: "Download full CSV",
      onSelect: onDownloadCsv,
      shortcut: "⌘D",
    },
    {
      icon: <Sparkles className="size-4" />,
      id: "smart-detect",
      label: "Smart detect",
      onSelect: onSmartDetect,
    },
    {
      icon: <RotateCcw className="size-4" />,
      id: "reset-defaults",
      label: "Reset defaults",
      onSelect: onResetDefaults,
    },
    {
      icon: <Eye className="size-4" />,
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      onSelect: onToggleSidebar,
      shortcut: "⌘B",
    },
    {
      icon: <Table2 className="size-4" />,
      id: "view-flat",
      label: "Switch to Flat rows",
      onSelect: () => onSwitchView("flat"),
    },
    {
      icon: <FileText className="size-4" />,
      id: "view-csv",
      label: "Switch to CSV output",
      onSelect: () => onSwitchView("csv"),
    },
    {
      icon: <Layers className="size-4" />,
      id: "view-schema",
      label: "Switch to Schema sidecar",
      onSelect: () => onSwitchView("schema"),
    },
  ];
}
