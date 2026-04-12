"use client";

import { useState, useEffect, useCallback } from "react";
import { useModes, ALL_MODES, MODE_LABELS, type ModeKey } from "@/components/layout/modes-context";

/* ─── Types & defaults ─────────────────────────────────────────── */

type FeatureGroup = { group: string; items: string[] };

type ModeContent = {
  shortDescription: string;
  longDescription: string;
  features: FeatureGroup[];
  useCases: string[];
  notes: string[];
  notRecommended: string[];
};

const DEFAULT_CONTENT: Record<ModeKey, ModeContent> = {
  Book: {
    shortDescription: "Write, outline, and publish books",
    longDescription:
      "Book mode gives you a full writing workspace — from outlining chapters and sections to composing prose, managing drafts, and publishing finished manuscripts. It includes a structured sidebar for navigation, a rich text editor for each section, AI-assisted brainstorming, and a publishing pipeline with version tracking.",
    features: [
      { group: "Core", items: ["Chapter and section-based structure", "Rich text editor with formatting tools", "Book Info panel (title, author, genre, summary)", "Prologue and Epilogue sections"] },
      { group: "Workflow", items: ["Compose, Manuscript, and Publish stages", "Version tracking with publish history", "Language editions and adaptation", "AI writing assistant per section"] },
      { group: "Advanced", items: ["Workspace tab for notes and research", "Import documents (DOCX, TXT)", "Export and review published versions"] },
    ],
    useCases: ["Writing novels, non-fiction, or memoir", "Drafting an ebook or self-published title", "Organizing long-form content with chapters", "Collaborative outlining with AI assistance"],
    notes: ["Each project gets a dedicated chapter sidebar", "Publishing creates an immutable version snapshot", "AI assistant context is scoped to the active section"],
    notRecommended: ["Short blog posts or articles (use a docs tool instead)", "Visual-heavy content like comics or magazines", "Real-time multi-author collaboration (not yet supported)"],
  },
  App: {
    shortDescription: "Plan and build app projects",
    longDescription:
      "App mode provides a structured environment for planning software products — from initial concept through screen design, feature mapping, and build planning. It's designed for solo founders, indie hackers, and small teams who want to think through their product before writing code.",
    features: [
      { group: "Core", items: ["App Info panel (name, tagline, purpose, platform)", "Concept brainstorming with committed versions", "Screen planning with grouped sections", "Feature list with descriptions"] },
      { group: "Workflow", items: ["Guided flow: Info → Concept → Screens → Features → Build Plan", "Auto-save to project record", "AI-assisted concept generation"] },
    ],
    useCases: ["Planning a new SaaS product or mobile app", "Documenting MVP scope and feature set", "Creating a build plan before development", "Validating app ideas with structured thinking"],
    notes: ["App data is stored within the project record", "Concept versions let you explore multiple directions", "Build Plan is a free-form section for technical notes"],
    notRecommended: ["Actual code development (use an IDE)", "Detailed UI/UX design (use Figma or similar)", "Project management with sprints and tickets"],
  },
  Music: {
    shortDescription: "Compose and produce songs",
    longDescription:
      "Songs mode is designed for songwriters and producers who want a structured creative space to develop lyrics, melodies, and arrangements. Plan your tracks from concept to final mix with organized sections and AI-powered inspiration.",
    features: [
      { group: "Core", items: ["Song structure editor (verse, chorus, bridge)", "Lyrics workspace with formatting", "Track info panel (title, artist, genre, mood)"] },
      { group: "Workflow", items: ["Concept → Write → Arrange → Produce stages", "AI lyric and melody brainstorming", "Version history for song drafts"] },
    ],
    useCases: ["Writing lyrics for singles or albums", "Structuring song arrangements", "Brainstorming melodic ideas with AI", "Organizing a catalog of works in progress"],
    notes: ["This mode is in early development", "Audio playback and recording are not yet supported", "Best suited for the writing and planning phase"],
    notRecommended: ["Audio recording or mixing (use a DAW)", "Sheet music notation", "Podcast or spoken-word production"],
  },
  Business: {
    shortDescription: "Launch and manage business ideas",
    longDescription:
      "Business mode helps you think through a new venture — from initial idea validation to business model, target market, revenue strategy, and launch planning. It provides a structured framework for turning ideas into actionable business plans.",
    features: [
      { group: "Core", items: ["Business Info panel (name, industry, model, stage)", "Idea validation workspace", "Market and competitor analysis sections", "Revenue model planner"] },
      { group: "Workflow", items: ["Ideate → Validate → Plan → Launch stages", "AI-assisted market research", "Structured business plan output"] },
    ],
    useCases: ["Validating a new startup idea", "Writing a lean business plan", "Mapping revenue streams and pricing", "Preparing for investor conversations"],
    notes: ["This mode is in early development", "Financial projections are text-based, not spreadsheets", "Best for early-stage planning and brainstorming"],
    notRecommended: ["Detailed financial modeling (use a spreadsheet)", "Legal document generation", "Day-to-day operations management"],
  },
};

const MODE_COLORS: Record<ModeKey, string> = {
  Book: "#4ade80",
  App: "#8b7cf5",
  Music: "#5a9af5",
  Business: "#fbbf24",
};

const CONTENT_STORAGE_KEY = "build-pilot-mode-content";

const TABS = ["Overview", "Features", "Use Cases"] as const;
type Tab = (typeof TABS)[number];

/* ─── Shared input styles ──────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 0",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid transparent",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  transition: "border-color 0.15s",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical" as const,
  lineHeight: 1.6,
  minHeight: 80,
};

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderBottomColor = "rgba(90,154,245,0.35)";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderBottomColor = "transparent";
}

/* ─── Page ─────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const { modes, setModeEnabled } = useModes();
  const [selected, setSelected] = useState<ModeKey>("Book");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [allContent, setAllContent] = useState<Record<ModeKey, ModeContent>>(DEFAULT_CONTENT);

  // Load saved content from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONTENT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setAllContent((prev) => {
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

  const persist = useCallback((next: Record<ModeKey, ModeContent>) => {
    setAllContent(next);
    localStorage.setItem(CONTENT_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updateMode = useCallback(
    (patch: Partial<ModeContent>) => {
      persist({ ...allContent, [selected]: { ...allContent[selected], ...patch } });
    },
    [allContent, selected, persist],
  );

  // Reset tab when switching modes
  useEffect(() => {
    setActiveTab("Overview");
  }, [selected]);

  const content = allContent[selected];
  const enabled = modes[selected];
  const color = MODE_COLORS[selected];

  return (
    <div className="mobile-px-4 flex flex-col" style={{ padding: "24px 32px", height: "calc(100vh - 48px)" }}>
      <h1 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
        Modes
      </h1>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Control which project modes are available in the app.
      </p>

      {/* Two-panel layout */}
      <div className="flex" style={{ marginTop: 24, gap: 20, flex: 1, minHeight: 0 }}>
        {/* ── Left panel: mode list ── */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {ALL_MODES.map((mode, i) => {
            const isActive = selected === mode;
            const modeEnabled = modes[mode];
            const modeColor = MODE_COLORS[mode];
            return (
              <button
                key={mode}
                onClick={() => setSelected(mode)}
                className="flex w-full items-center gap-3 text-left"
                style={{
                  padding: "12px 14px",
                  borderBottom: i < ALL_MODES.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  background: isActive ? "var(--overlay-active)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--overlay-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: modeColor, opacity: modeEnabled ? 1 : 0.3, flexShrink: 0 }} />
                <span className="text-[13px] font-medium" style={{ color: isActive ? "var(--text-primary)" : modeEnabled ? "var(--text-secondary)" : "var(--text-muted)" }}>
                  {MODE_LABELS[mode]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Right panel: detail with tabs ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header: title + toggle */}
          <div className="flex items-center justify-between" style={{ padding: "14px 20px 0" }}>
            <div className="flex items-center gap-2.5">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, opacity: enabled ? 1 : 0.35, flexShrink: 0 }} />
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {MODE_LABELS[selected]}
              </h2>
            </div>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => setModeEnabled(selected, !enabled)}
              style={{ position: "relative", width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: enabled ? "#5a9af5" : "var(--overlay-active)", transition: "background 0.2s", flexShrink: 0 }}
            >
              <span style={{ position: "absolute", top: 2, left: enabled ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ padding: "0 20px", marginTop: 12, gap: 0, borderBottom: "1px solid var(--border-subtle)" }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="text-[12px] font-medium"
                  style={{
                    padding: "6px 14px 8px",
                    background: "transparent",
                    border: "none",
                    borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                    cursor: "pointer",
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    transition: "all 0.12s",
                    marginBottom: -1,
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: "16px 20px 20px", flex: 1, overflowY: "auto" }}>
            {activeTab === "Overview" && (
              <OverviewTab content={content} enabled={enabled} onChange={updateMode} />
            )}
            {activeTab === "Features" && (
              <FeaturesTab features={content.features} color={color} onChange={(features) => updateMode({ features })} />
            )}
            {activeTab === "Use Cases" && (
              <UseCasesTab
                useCases={content.useCases}
                notes={content.notes}
                notRecommended={content.notRecommended}
                onChange={updateMode}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────────── */

function OverviewTab({
  content,
  enabled,
  onChange,
}: {
  content: ModeContent;
  enabled: boolean;
  onChange: (patch: Partial<ModeContent>) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div
        className="text-[12px] font-medium"
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          padding: "3px 10px",
          borderRadius: 20,
          background: enabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.10)",
          color: enabled ? "#4ade80" : "#f87171",
        }}
      >
        {enabled ? "Enabled" : "Disabled"}
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          Short Description
        </label>
        <input
          type="text"
          value={content.shortDescription}
          onChange={(e) => onChange({ shortDescription: e.target.value })}
          onFocus={focusBorder}
          onBlur={blurBorder}
          style={inputStyle}
          placeholder="One-line summary of this mode"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          Full Description
        </label>
        <textarea
          value={content.longDescription}
          onChange={(e) => onChange({ longDescription: e.target.value })}
          onFocus={focusBorder}
          onBlur={blurBorder}
          style={textareaStyle}
          rows={4}
          placeholder="Detailed description of what this mode does"
        />
      </div>
    </div>
  );
}

/* ─── Features Tab ─────────────────────────────────────────────── */

function FeaturesTab({
  features,
  color,
  onChange,
}: {
  features: FeatureGroup[];
  color: string;
  onChange: (features: FeatureGroup[]) => void;
}) {
  function updateGroup(gi: number, patch: Partial<FeatureGroup>) {
    const next = features.map((g, i) => (i === gi ? { ...g, ...patch } : g));
    onChange(next);
  }

  function updateItem(gi: number, ii: number, value: string) {
    const next = features.map((g, i) =>
      i === gi ? { ...g, items: g.items.map((item, j) => (j === ii ? value : item)) } : g,
    );
    onChange(next);
  }

  function removeItem(gi: number, ii: number) {
    const next = features.map((g, i) =>
      i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g,
    );
    onChange(next);
  }

  function addItem(gi: number) {
    const next = features.map((g, i) =>
      i === gi ? { ...g, items: [...g.items, ""] } : g,
    );
    onChange(next);
  }

  function addGroup() {
    onChange([...features, { group: "New Group", items: [""] }]);
  }

  function removeGroup(gi: number) {
    onChange(features.filter((_, i) => i !== gi));
  }

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {features.map((group, gi) => (
        <div key={gi}>
          {/* Group header */}
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <input
              type="text"
              value={group.group}
              onChange={(e) => updateGroup(gi, { group: e.target.value })}
              onFocus={focusBorder}
              onBlur={blurBorder}
              className="text-[10px] font-semibold uppercase"
              style={{
                ...inputStyle,
                padding: "2px 0",
                width: 140,
                letterSpacing: "0.06em",
                fontSize: 10,
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
              placeholder="Group name"
            />
            <button
              onClick={() => removeGroup(gi)}
              title="Remove group"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 4px" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              &times;
            </button>
          </div>

          {/* Items */}
          <div className="flex flex-col" style={{ gap: 4 }}>
            {group.items.map((item, ii) => (
              <div key={ii} className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color }}>
                  <path d="M3.5 7l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateItem(gi, ii, e.target.value)}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  style={{ ...inputStyle, fontSize: 13 }}
                  placeholder="Feature description"
                />
                <button
                  onClick={() => removeItem(gi, ii)}
                  title="Remove item"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          {/* Add item */}
          <button
            onClick={() => addItem(gi)}
            className="text-[11px] font-medium"
            style={{ marginTop: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 0", transition: "color 0.12s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            + Add feature
          </button>
        </div>
      ))}

      {/* Add group */}
      <button
        onClick={addGroup}
        className="text-[11px] font-medium"
        style={{ marginTop: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 0", transition: "color 0.12s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        + Add group
      </button>
    </div>
  );
}

/* ─── Use Cases Tab ────────────────────────────────────────────── */

function UseCasesTab({
  useCases,
  notes,
  notRecommended,
  onChange,
}: {
  useCases: string[];
  notes: string[];
  notRecommended: string[];
  onChange: (patch: Partial<ModeContent>) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 22 }}>
      <EditableBulletSection
        title="Best use cases"
        items={useCases}
        color="#4ade80"
        addLabel="+ Add use case"
        placeholder="Describe a use case"
        onChange={(items) => onChange({ useCases: items })}
      />
      <EditableBulletSection
        title="Important notes"
        items={notes}
        color="#5a9af5"
        addLabel="+ Add note"
        placeholder="Add a note"
        onChange={(items) => onChange({ notes: items })}
      />
      <EditableBulletSection
        title="When not to use this mode"
        items={notRecommended}
        color="#f87171"
        addLabel="+ Add item"
        placeholder="When this mode isn't the right fit"
        onChange={(items) => onChange({ notRecommended: items })}
      />
    </div>
  );
}

function EditableBulletSection({
  title,
  items,
  color,
  addLabel,
  placeholder,
  onChange,
}: {
  title: string;
  items: string[];
  color: string;
  addLabel: string;
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
        {title}
      </p>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span style={{ color, flexShrink: 0, fontSize: 10, marginTop: 1 }}>●</span>
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              onFocus={focusBorder}
              onBlur={blurBorder}
              style={{ ...inputStyle, fontSize: 13 }}
              placeholder={placeholder}
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title="Remove"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, ""])}
        className="text-[11px] font-medium"
        style={{ marginTop: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 0", transition: "color 0.12s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        {addLabel}
      </button>
    </div>
  );
}
