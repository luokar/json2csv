import { CheckSquare, Copy, ExternalLink, FileJson, Search, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface RowContextMenuProps {
  anchorPoint: { x: number; y: number };
  isSelected: boolean;
  onClose: () => void;
  onCopyJson?: () => void;
  onCopyRow?: () => void;
  onInspectRow?: () => void;
  onOpenDetail?: () => void;
  onToggleSelect: () => void;
}

export function RowContextMenu({
  anchorPoint,
  isSelected,
  onClose,
  onCopyJson,
  onCopyRow,
  onInspectRow,
  onOpenDetail,
  onToggleSelect,
}: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(anchorPoint);

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
      <button type="button" className={itemClass} onClick={() => handleAction(onToggleSelect)}>
        {isSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
        {isSelected ? "Deselect row" : "Select row"}
      </button>
      <div className="my-1 h-px bg-border" />
      {onInspectRow ? (
        <button type="button" className={itemClass} onClick={() => handleAction(onInspectRow)}>
          <Search className="size-4" />
          Inspect row
        </button>
      ) : null}
      {onOpenDetail ? (
        <button type="button" className={itemClass} onClick={() => handleAction(onOpenDetail)}>
          <ExternalLink className="size-4" />
          Open detail
        </button>
      ) : null}
      <div className="my-1 h-px bg-border" />
      {onCopyJson ? (
        <button type="button" className={itemClass} onClick={() => handleAction(onCopyJson)}>
          <FileJson className="size-4" />
          Copy as JSON
        </button>
      ) : null}
      {onCopyRow ? (
        <button type="button" className={itemClass} onClick={() => handleAction(onCopyRow)}>
          <Copy className="size-4" />
          Copy row
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
