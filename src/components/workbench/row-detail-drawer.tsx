import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RowDetailDrawerProps {
  headers: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: Record<string, string> | null;
  rowLabel: string;
}

export function RowDetailDrawer({
  headers,
  isOpen,
  onOpenChange,
  row,
  rowLabel,
}: RowDetailDrawerProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in fade-in duration-150" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="truncate text-base font-semibold text-foreground">
              {rowLabel}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {row ? (
              <div className="space-y-0.5">
                {headers.map((header) => {
                  const value = row[header] ?? "";

                  return (
                    <div
                      key={header}
                      className="flex flex-col gap-0.5 rounded-lg px-3 py-2 hover:bg-muted/50"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {header}
                      </span>
                      <span className="break-words text-sm text-foreground">
                        {value || "\u00A0"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No row selected.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
