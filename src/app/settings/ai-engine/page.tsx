"use client";

import { useState, useEffect, useCallback } from "react";
import { useModes, ALL_MODES, MODE_LABELS, type ModeKey } from "@/components/layout/modes-context";
import { saveGlobalInstruction } from "@/lib/ai-engine";

/* ─── Types & defaults ─────────────────────────────────────────── */

type StageInstructions = {
  master: string;
  compose: string;
  manuscript: string;
  publish: string;
};

type StageKey = keyof StageInstructions;

const EMPTY_INSTRUCTIONS: StageInstructions = {
  master: "",
  compose: "",
  manuscript: "",
  publish: "",
};

const TABS: { key: StageKey; label: string }[] = [
  { key: "master", label: "Master" },
  { key: "compose", label: "Compose" },
  { key: "manuscript", label: "Manuscript" },
  { key: "publish", label: "Publish" },
];

const TAB_TITLES: Record<StageKey, string> = {
  master: "Master Instructions",
  compose: "Compose Instructions",
  manuscript: "Manuscript Instructions",
  publish: "Publish Instructions",
};

const TAB_DESCRIPTIONS: Record<StageKey, string> = {
  master: "Core behavior rules for this mode. Applied to every AI request.",
  compose: "Instructions for AI behavior in the Compose page (writing, brainstorming, drafting).",
  manuscript: "Instructions for AI behavior in the Manuscript page (review, structure, consistency).",
  publish: "Instructions for AI behavior in the Publish page (finalization, formatting, readiness).",
};

const MODE_COLORS: Record<ModeKey, string> = {
  Book: "#4ade80",
  App: "#8b7cf5",
  Music: "#5a9af5",
  Business: "#fbbf24",
};

const STORAGE_KEY = "build-pilot-ai-engine";

/* ─── Page ─────────────────────────────────────────────────────── */

type SelectedPanel = "global" | ModeKey;

export default function AIEnginePage() {
  const { modes } = useModes();
  const [selected, setSelected] = useState<SelectedPanel>("Book");
  const [activeTab, setActiveTab] = useState<StageKey>("master");
  const [globalInstruction, setGlobalInstruction] = useState("");
  const [data, setData] = useState<Record<ModeKey, StageInstructions>>(() => {
    const empty: Record<string, StageInstructions> = {};
    for (const m of ALL_MODES) empty[m] = { ...EMPTY_INSTRUCTIONS };
    return empty as Record<ModeKey, StageInstructions>;
  });

  // Load from localStorage
  useEffect(() => {
    try {
      const savedGlobal = localStorage.getItem("build-pilot-ai-engine-global");
      if (savedGlobal) setGlobalInstruction(savedGlobal);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData((prev) => {
          const merged = { ...prev };
          for (const key of ALL_MODES) {
            if (parsed[key]) merged[key] = { ...prev[key], ...parsed[key] };
          }
          return merged;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const persist = useCallback((next: Record<ModeKey, StageInstructions>) => {
    setData(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updateInstruction = useCallback(
    (stage: StageKey, value: string) => {
      const mode = selected === "global" ? "Book" : selected as ModeKey;
      persist({
        ...data,
        [mode]: { ...data[mode], [stage]: value },
      });
    },
    [data, selected, persist],
  );

  // Reset tab on mode switch
  useEffect(() => {
    setActiveTab("master");
  }, [selected]);

  const isGlobal = selected === "global";
  const selectedMode = isGlobal ? "Book" : selected as ModeKey;
  const color = isGlobal ? "#5a9af5" : MODE_COLORS[selectedMode];
  const instructions = data[selectedMode];
  const tabIsActive = activeTab;

  return (
    <div
      className="mobile-px-4 flex flex-col"
      style={{
        position: "relative",
        zIndex: 1,
        padding: "24px 32px",
        height: "calc(100vh - 48px)",
        background: "var(--surface-1)",
        isolation: "isolate",
        overflow: "hidden",
      }}
    >
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            AI Engine
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Configure AI behavior per mode and stage
          </p>
        </div>
        <span
          className="text-[10px] font-medium uppercase"
          style={{ letterSpacing: "0.08em", color: "var(--text-muted)", opacity: 0.5 }}
        >
          Internal
        </span>
      </div>

      {/* Two-panel layout */}
      <div className="flex" style={{ marginTop: 20, gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Left panel: mode list ── */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Global item */}
          <button
            onClick={() => setSelected("global")}
            className="flex w-full items-center gap-3 text-left"
            style={{
              padding: "10px 14px",
              background: selected === "global" ? "var(--overlay-active)" : "transparent",
              border: "none",
              borderLeft: selected === "global" ? "2px solid #5a9af5" : "2px solid transparent",
              borderBottom: "1px solid var(--border-subtle)",
              cursor: "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={(e) => { if (selected !== "global") e.currentTarget.style.background = "var(--overlay-hover)"; }}
            onMouseLeave={(e) => { if (selected !== "global") e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5a9af5", flexShrink: 0 }} />
            <span
              className="text-[13px] font-medium"
              style={{ color: selected === "global" ? "var(--text-primary)" : "var(--text-secondary)", flex: 1 }}
            >
              Global
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>All modes</span>
          </button>

          {/* Panel label */}
          <div style={{ padding: "10px 14px 6px" }}>
            <p
              className="text-[9px] font-semibold uppercase"
              style={{ letterSpacing: "0.08em", color: "var(--text-muted)", opacity: 0.6 }}
            >
              Modes
            </p>
          </div>

          {ALL_MODES.map((mode) => {
            const isActive = selected === mode;
            const modeColor = MODE_COLORS[mode];
            const modeEnabled = modes[mode];
            return (
              <button
                key={mode}
                onClick={() => setSelected(mode)}
                className="flex w-full items-center gap-3 text-left"
                style={{
                  padding: "10px 14px",
                  background: isActive ? "var(--overlay-active)" : "transparent",
                  border: "none",
                  borderLeft: isActive ? `2px solid ${modeColor}` : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--overlay-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: modeColor,
                    opacity: modeEnabled ? 1 : 0.25,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="text-[13px] font-medium"
                  style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)", flex: 1 }}
                >
                  {MODE_LABELS[mode]}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: modeEnabled ? "rgba(74,222,128,0.7)" : "var(--text-muted)", flexShrink: 0 }}
                >
                  {modeEnabled ? "Enabled" : "Disabled"}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Right panel ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div style={{ padding: "14px 22px 0" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    boxShadow: `0 0 8px ${color}40`,
                  }}
                />
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {isGlobal ? "Global Instructions" : MODE_LABELS[selectedMode]}
                </h2>
              </div>
              <span
                className="text-[10px] font-medium uppercase"
                style={{
                  letterSpacing: "0.06em",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--overlay-hover)",
                  color: "var(--text-muted)",
                }}
              >
                Internal AI Configuration
              </span>
            </div>
          </div>

          {isGlobal ? (
            /* ── Global instruction editor ── */
            <div style={{ padding: "18px 22px 18px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 4 }}>
                Global System Instruction
              </h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
                Applied to every AI request across all modes, before any mode-specific or page-specific instructions.
              </p>
              <textarea
                value={globalInstruction}
                onChange={(e) => {
                  setGlobalInstruction(e.target.value);
                  saveGlobalInstruction(e.target.value);
                }}
                placeholder={"Enter global instructions that apply to all AI requests...\n\nExample:\n- Always respond in plain text, no markdown\n- Be concise and direct\n- Speak to the user as a creative collaborator"}
                style={{
                  flex: 1,
                  width: "100%",
                  padding: "14px 16px",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  lineHeight: 1.7,
                  outline: "none",
                  resize: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(90,154,245,0.35)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
              />
              <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                <p className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                  Auto-saved to local storage
                </p>
                <span className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.4 }}>
                  {globalInstruction.length > 0 ? `${globalInstruction.length} chars` : "Empty"}
                </span>
              </div>
            </div>
          ) : (
            /* ── Mode-specific tabs + editor ── */
            <>
          {/* Tabs */}
          <div
            className="flex"
            style={{
              padding: "0 22px",
              marginTop: 14,
              gap: 2,
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            {TABS.map((tab) => {
              const isActive = tabIsActive === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="text-[12px] font-medium"
                  style={{
                    padding: "7px 16px 9px",
                    background: isActive ? "var(--overlay-hover)" : "transparent",
                    border: isActive ? `1px solid var(--border-subtle)` : "1px solid transparent",
                    borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                    borderRadius: "6px 6px 0 0",
                    cursor: "pointer",
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: isActive ? 600 : 500,
                    transition: "all 0.12s",
                    marginBottom: -1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-secondary)";
                      e.currentTarget.style.background = "var(--overlay-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: "18px 22px 18px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <h3
              className="text-[13px] font-semibold"
              style={{ color: "var(--text-primary)", marginBottom: 4 }}
            >
              {TAB_TITLES[activeTab]}
            </h3>
            <p
              className="text-[11px]"
              style={{ color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}
            >
              {TAB_DESCRIPTIONS[activeTab]}
            </p>

            <textarea
              value={instructions[activeTab]}
              onChange={(e) => updateInstruction(activeTab, e.target.value)}
              placeholder={`Enter ${activeTab} instructions for ${MODE_LABELS[selectedMode]} mode...\n\nExample:\n- Always respond in a professional tone\n- Keep suggestions concise\n- Reference existing content when possible`}
              style={{
                flex: 1,
                width: "100%",
                padding: "14px 16px",
                background: "var(--overlay-card)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                lineHeight: 1.7,
                outline: "none",
                resize: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = `${color}50`)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
            />

            <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
              <p className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                Auto-saved to local storage
              </p>
              <span
                className="text-[10px]"
                style={{ color: "var(--text-muted)", opacity: 0.4 }}
              >
                {instructions[activeTab].length > 0
                  ? `${instructions[activeTab].length} chars`
                  : "Empty"}
              </span>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
