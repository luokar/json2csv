import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Clipboard, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Inline text input shown when a cell enters edit mode.
 */
export function InlineEditInput({
  defaultValue,
  onCancel,
  onCommit,
}: {
  defaultValue: string;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      className="w-full bg-transparent text-sm text-foreground outline-none ring-1 ring-primary rounded px-1"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onCommit(ref.current!.value);
          e.stopPropagation();
        }
        if (e.key === "Escape") {
          onCancel();
          e.stopPropagation();
        }
      }}
      onBlur={() => onCommit(ref.current!.value)}
    />
  );
}

/**
 * Floating popover that shows a cell's full value with a copy-to-clipboard
 * action. Anchors itself to the supplied rect and flips position to stay
 * inside the viewport.
 */
export function CellDetailPopover({
  anchorRect,
  onClose,
  value,
}: {
  anchorRect: { top: number; left: number; width: number; height: number };
  onClose: () => void;
  value: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchorRect.left, y: anchorRect.top + anchorRect.height + 4 });

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = anchorRect.top - rect.height - 4;
    if (x < 0) x = 8;
    if (x !== position.x || y !== position.y) setPosition({ x, y });
  }, [anchorRect]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 w-96 max-w-[90vw] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cell value</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(value).then(() => toast.success("Cell value copied."));
            }}
          >
            <Clipboard className="size-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto rounded border border-border bg-muted/30 p-2">
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">{value}</pre>
      </div>
    </div>,
    document.body,
  );
}

/**
 * TableHead wrapper that wires up dnd-kit's sortable hooks so the column
 * header can be dragged to reorder columns.
 */
export function SortableHeaderCell({
  children,
  className,
  headerId,
  style,
}: {
  children: ReactNode;
  className?: string;
  headerId: string;
  style?: CSSProperties;
}) {
  const {
    isDragging,
    isOver,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: headerId });

  const combinedStyle: CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3, zIndex: 30 } : undefined),
  };

  return (
    <TableHead
      ref={setNodeRef}
      className={cn(
        className,
        "cursor-grab",
        isDragging && "cursor-grabbing border-dashed border-primary",
        isOver && !isDragging && "border-l-2 border-l-primary bg-primary/5",
      )}
      style={combinedStyle}
      {...listeners}
    >
      {children}
    </TableHead>
  );
}
