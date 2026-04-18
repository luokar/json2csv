import { useEffect } from "react";

interface KeyboardShortcutHandlers {
  onDownloadCsv: () => void;
  onOpenCommandPalette: () => void;
  onRedo: () => void;
  onShowShortcutsHelp: () => void;
  onToggleSidebar: () => void;
  onUndo: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName.toLowerCase();

      if (
        event.key === "?" &&
        activeTag !== "input" &&
        activeTag !== "textarea" &&
        activeTag !== "select" &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        handlers.onShowShortcutsHelp();
        return;
      }

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
        return;
      }

      if (isMetaOrCtrl && event.shiftKey && event.key === "z") {
        event.preventDefault();
        handlers.onRedo();
        return;
      }

      if (isMetaOrCtrl && event.key === "z") {
        event.preventDefault();
        handlers.onUndo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
