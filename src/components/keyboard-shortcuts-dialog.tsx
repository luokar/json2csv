import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

const shortcutSections = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "⌘K", description: "Open command palette" },
      { keys: "⌘B", description: "Toggle sidebar" },
      { keys: "⌘F", description: "Focus search" },
      { keys: "⌘⇧F", description: "Toggle column filters" },
      { keys: "?", description: "Show keyboard shortcuts" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: "⌘D", description: "Download CSV" },
      { keys: "⌘Z", description: "Undo column change" },
      { keys: "⌘⇧Z", description: "Redo column change" },
    ],
  },
  {
    title: "Row Detail",
    shortcuts: [
      { keys: "↑ / ↓", description: "Navigate rows (when drawer is open)" },
    ],
  },
];

export function KeyboardShortcutsDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in fade-in duration-150" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-4">
            {shortcutSections.map((section) => (
              <div key={section.title}>
                <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                    >
                      <span>{shortcut.description}</span>
                      <Kbd>{shortcut.keys}</Kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
