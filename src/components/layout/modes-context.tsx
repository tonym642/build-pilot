"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/mode-preferences");
        if (!res.ok) return;
        const row = await res.json();
        if (row.modes && typeof row.modes === "object") {
          setModes((prev) => ({ ...prev, ...row.modes }));
        }
      } catch {
        // ignore — use defaults
      }
    })();
  }, []);

  const persistToSupabase = useCallback((next: Record<ModeKey, boolean>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await fetch("/api/mode-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modes: next }),
        });
      } catch {
        // ignore
      }
    }, 500);
  }, []);

  const setModeEnabled = useCallback((mode: ModeKey, enabled: boolean) => {
    setModes((prev) => {
      const next = { ...prev, [mode]: enabled };
      persistToSupabase(next);
      return next;
    });
  }, [persistToSupabase]);

  const isModeEnabled = useCallback((mode: ModeKey) => modes[mode] ?? false, [modes]);

  const enabledModes = useMemo(() => ALL_MODES.filter((m) => modes[m]), [modes]);

  const value = useMemo(
    () => ({ modes, setModeEnabled, isModeEnabled, enabledModes }),
    [modes, setModeEnabled, isModeEnabled, enabledModes],
  );

  return <ModesContext.Provider value={value}>{children}</ModesContext.Provider>;
}
