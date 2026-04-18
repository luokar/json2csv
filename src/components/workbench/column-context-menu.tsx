import { ArrowDown, ArrowUp, Copy, EyeOff, Pin, PinOff, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ColumnContextMenuProps {
  anchorPoint: { x: number; y: number };
  columnId: string;
  isPinned: boolean;
  isSorted: false | "asc" | "desc";
  onClearSort: () => void;
  onClose: () => void;
  onCopyName: () => void;
  onHideColumn: () => void;
  onInspectColumn: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onTogglePin: () => void;
}

export function ColumnContextMenu({
  anchorPoint,
  isPinned,
  isSorted,
  onClearSort,
  onClose,
  onCopyName,
  onHideColumn,
  onInspectColumn,
  onSortAsc,
  onSortDesc,
  onTogglePin,
}: ColumnContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(anchorPoint);

  // Viewport clamping
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let { x, y } = anchorPoint;
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }
    if (x !== anchorPoint.x || y !== anchorPoint.y) {
      setPosition({ x, y });
    }
  }, [anchorPoint]);

  // Close on outside click and Escape
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function handleAction(action: () => void) {
    action();
    onClose();
  }

  const itemClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
    >
      <button type="button" className={itemClass} onClick={() => handleAction(onSortAsc)}>
        <ArrowUp className="size-4" />
        Sort ascending
      </button>
      <button type="button" className={itemClass} onClick={() => handleAction(onSortDesc)}>
        <ArrowDown className="size-4" />
        Sort descending
      </button>
      {isSorted ? (
        <button type="button" className={itemClass} onClick={() => handleAction(onClearSort)}>
          <X className="size-4" />
          Clear sort
        </button>
      ) : null}
      <div className="my-1 h-px bg-border" />
      <button type="button" className={itemClass} onClick={() => handleAction(onHideColumn)}>
        <EyeOff className="size-4" />
        Hide column
      </button>
      <button type="button" className={itemClass} onClick={() => handleAction(onTogglePin)}>
        {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        {isPinned ? "Unpin column" : "Pin column"}
      </button>
      <button type="button" className={itemClass} onClick={() => handleAction(onInspectColumn)}>
        <Search className="size-4" />
        Inspect column
      </button>
      <button type="button" className={itemClass} onClick={() => handleAction(onCopyName)}>
        <Copy className="size-4" />
        Copy column name
      </button>
    </div>,
    document.body,
  );
}
