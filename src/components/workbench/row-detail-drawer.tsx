import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Copy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RowDetailDrawerProps {
  hasNext?: boolean;
  hasPrev?: boolean;
  headers: string[];
  isOpen: boolean;
  onNavigate?: (direction: "prev" | "next") => void;
  onOpenChange: (open: boolean) => void;
  row: Record<string, string> | null;
  rowLabel: string;
}

const urlPattern = /^https?:\/\/\S+$/;

function renderValue(value: string) {
  if (!value) return "\u00A0";

  if (urlPattern.test(value)) {
    return (
      <a
        className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
        href={value}
        rel="noopener noreferrer"
        target="_blank"
      >
        {value}
      </a>
    );
  }

  if (value.length > 100) {
    return (
      <span className="break-all font-mono text-xs whitespace-pre-wrap">
        {value}
      </span>
    );
  }

  return <span className="break-words text-sm text-foreground">{value}</span>;
}

export function RowDetailDrawer({
  hasNext = false,
  hasPrev = false,
  headers,
  isOpen,
  onNavigate,
  onOpenChange,
  row,
  rowLabel,
}: RowDetailDrawerProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [row]);

  const filteredHeaders = useMemo(() => {
    if (!search || !row) return headers;
    const query = search.toLowerCase();
    return headers.filter((header) => {
      const value = row[header] ?? "";
      return (
        header.toLowerCase().includes(query) ||
        value.toLowerCase().includes(query)
      );
    });
  }, [headers, row, search]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in fade-in duration-150" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              {rowLabel}
            </Dialog.Title>
            <div className="flex shrink-0 items-center gap-1">
              {onNavigate ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!hasPrev}
                    onClick={() => onNavigate("prev")}
                    aria-label="Previous row"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!hasNext}
                    onClick={() => onNavigate("next")}
                    aria-label="Next row"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </>
              ) : null}
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0">
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {row ? (
            <>
              <div className="border-b border-border px-5 py-3">
                <Input
                  aria-label="Search fields"
                  className="h-8"
                  placeholder="Search fields..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="space-y-0.5">
                  {filteredHeaders.length > 0 ? (
                    filteredHeaders.map((header) => {
                      const value = row[header] ?? "";

                      return (
                        <div
                          key={header}
                          className="group flex flex-col gap-0.5 rounded-lg px-3 py-2 hover:bg-muted/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {header}
                            </span>
                            {value ? (
                              <button
                                type="button"
                                aria-label={`Copy ${header} value`}
                                className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
                                onClick={() =>
                                  void navigator.clipboard.writeText(value)
                                }
                              >
                                <Copy className="size-3" />
                              </button>
                            ) : null}
                          </div>
                          {renderValue(value)}
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No fields match &ldquo;{search}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="py-10 text-center text-sm text-muted-foreground">
                No row selected.
              </p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
