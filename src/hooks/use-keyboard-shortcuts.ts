import { useEffect } from "react";

interface KeyboardShortcutHandlers {
  onDownloadCsv: () => void;
  onOpenCommandPalette: () => void;
  onToggleSidebar: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;

      if (isMetaOrCtrl && event.key === "k") {
        event.preventDefault();
        handlers.onOpenCommandPalette();
        return;
      }

      if (isMetaOrCtrl && event.key === "b") {
        event.preventDefault();
        handlers.onToggleSidebar();
        return;
      }

      if (isMetaOrCtrl && event.key === "d") {
        event.preventDefault();
        handlers.onDownloadCsv();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
