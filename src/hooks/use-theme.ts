import { useCallback, useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const DARK_CLASS = "dark";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "system";
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MEDIA_QUERY).matches;
}

function applyTheme(theme: Theme): void {
  const isDark =
    theme === "dark" || (theme === "system" && getSystemPrefersDark());
  document.documentElement.classList.toggle(DARK_CLASS, isDark);
}

let currentTheme: Theme = getStoredTheme();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return currentTheme;
}

function setThemeInternal(theme: Theme): void {
  currentTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable
  }
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
}

// Listen for system preference changes
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window
    .matchMedia(MEDIA_QUERY)
    .addEventListener("change", () => {
      if (currentTheme === "system") {
        applyTheme("system");
      }
    });
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);

  const setTheme = useCallback((next: Theme) => {
    setThemeInternal(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const resolvedTheme: "light" | "dark" =
    theme === "system"
      ? getSystemPrefersDark()
        ? "dark"
        : "light"
      : theme;

  return { theme, setTheme, resolvedTheme } as const;
}
