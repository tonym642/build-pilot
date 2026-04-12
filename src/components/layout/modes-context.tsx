"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export type ModeKey = "Book" | "App" | "Business" | "Music";

/** Display labels used in the settings UI */
export const MODE_LABELS: Record<ModeKey, string> = {
  Book: "Book",
  App: "Apps",
  Business: "Business",
  Music: "Songs",
};

/** All mode keys in display order */
export const ALL_MODES: ModeKey[] = ["Book", "App", "Music", "Business"];

const STORAGE_KEY = "build-pilot-modes";

const DEFAULTS: Record<ModeKey, boolean> = {
  Book: true,
  App: false,
  Business: false,
  Music: false,
};

type ModesContextValue = {
  modes: Record<ModeKey, boolean>;
  setModeEnabled: (mode: ModeKey, enabled: boolean) => void;
  isModeEnabled: (mode: ModeKey) => boolean;
  enabledModes: ModeKey[];
};

const ModesContext = createContext<ModesContextValue>({
  modes: DEFAULTS,
  setModeEnabled: () => {},
  isModeEnabled: () => false,
  enabledModes: ["Book"],
});

export function useModes() {
  return useContext(ModesContext);
}

export function ModesProvider({ children }: { children: React.ReactNode }) {
  const [modes, setModes] = useState<Record<ModeKey, boolean>>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setModes((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
  }, []);

  const setModeEnabled = useCallback((mode: ModeKey, enabled: boolean) => {
    setModes((prev) => {
      const next = { ...prev, [mode]: enabled };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isModeEnabled = useCallback((mode: ModeKey) => modes[mode] ?? false, [modes]);

  const enabledModes = useMemo(() => ALL_MODES.filter((m) => modes[m]), [modes]);

  const value = useMemo(
    () => ({ modes, setModeEnabled, isModeEnabled, enabledModes }),
    [modes, setModeEnabled, isModeEnabled, enabledModes],
  );

  return <ModesContext.Provider value={value}>{children}</ModesContext.Provider>;
}
