"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useMainSidebar } from "@/components/layout/sidebar-context";

/* ─── types ──────────────────────────────────────────────────────── */

type AppInfo = {
  appName: string;
  tagline: string;
  purpose: string;
  targetUser: string;
  problemSolved: string;
  appType: string;
  platform: string;
  businessModel: string;
  status: string;
};

const EMPTY_APP_INFO: AppInfo = {
  appName: "",
  tagline: "",
  purpose: "",
  targetUser: "",
  problemSolved: "",
  appType: "",
  platform: "",
  businessModel: "",
  status: "",
};

type Screen = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type Section = {
  id: string;
  screenId: string;
  name: string;
  brainstorm: string;
  committed: string;
  createdAt: string;
  updatedAt: string;
};

type Feature = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type ConceptData = {
  brainstorm: string;
  committed: string;
};

type BuildPlanData = {
  content: string;
};

type AppData = {
  appInfo: AppInfo;
  concept: ConceptData;
  screens: Screen[];
  sections: Section[];
  features: Feature[];
  buildPlan: BuildPlanData;
};

const EMPTY_APP_DATA: AppData = {
  appInfo: EMPTY_APP_INFO,
  concept: { brainstorm: "", committed: "" },
  screens: [],
  sections: [],
  features: [],
  buildPlan: { content: "" },
};

/* ─── top-level pages ────────────────────────────────────────────── */

const PAGES = ["App Info", "Concept", "Screens", "Features", "Build Plan"] as const;
type PageId = (typeof PAGES)[number];

/* ─── view stack for drill-down ──────────────────────────────────── */

type ViewState =
  | { page: "App Info" }
  | { page: "Concept" }
  | { page: "Screens"; screenId?: undefined }
  | { page: "Screens"; screenId: string; sectionId?: undefined }
  | { page: "Screens"; screenId: string; sectionId: string }
  | { page: "Features"; featureId?: string }
  | { page: "Build Plan" };

/* ─── sub-components ─────────────────────────────────────────────── */

function AppInfoPanel({
  appInfo,
  onChange,
}: {
  appInfo: AppInfo;
  onChange: (updated: AppInfo) => void;
}) {
  const fields: { key: keyof AppInfo; label: string; multiline?: boolean; placeholder?: string }[] = [
    { key: "appName", label: "App Name", placeholder: "e.g. TaskFlow" },
    { key: "tagline", label: "Tagline", placeholder: "e.g. Work smarter, not harder" },
    { key: "purpose", label: "One-Line Purpose", placeholder: "A single sentence describing what the app does" },
    { key: "targetUser", label: "Target User", placeholder: "e.g. Freelancers managing multiple clients" },
    { key: "problemSolved", label: "Main Problem Solved", multiline: true, placeholder: "What pain point does this app eliminate?" },
    { key: "appType", label: "App Type", placeholder: "e.g. SaaS, Mobile App, Marketplace" },
    { key: "platform", label: "Platform", placeholder: "e.g. Web, iOS, Android, Cross-platform" },
    { key: "businessModel", label: "Business Model", placeholder: "e.g. Freemium, Subscription, One-time purchase" },
    { key: "status", label: "Status", placeholder: "e.g. Idea, Prototyping, In Development, Launched" },
  ];

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-8 py-8 mobile-px-4" style={{ maxWidth: 720 }}>
        <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>App Info</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Core details about your app — keep it sharp.</p>
        <div className="mt-7 flex flex-col gap-5">
          {fields.map(({ key, label, multiline, placeholder }) => (
            <div key={key} className="flex gap-6 mobile-stack" style={{ alignItems: multiline ? "flex-start" : "center" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: multiline ? 10 : 0, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                {label}
              </label>
              <div className="flex-1">
                {multiline ? (
                  <textarea
                    rows={3}
                    value={appInfo[key]}
                    onChange={(e) => onChange({ ...appInfo, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                  />
                ) : (
                  <input
                    type="text"
                    value={appInfo[key]}
                    onChange={(e) => onChange({ ...appInfo, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConceptPanel({
  concept,
  onChange,
}: {
  concept: ConceptData;
  onChange: (updated: ConceptData) => void;
}) {
  return (
    <div className="flex h-full min-h-0 mobile-stack">
      {/* Left: brainstorm */}
      <div className="flex flex-1 flex-col border-r border-[var(--border-default)] min-h-0">
        <div className="shrink-0 px-6 pt-6 pb-3">
          <h3 className="text-[13px] font-medium text-[var(--text-tertiary)]">Working Ideas</h3>
          <p className="mt-0.5 text-xs text-[var(--text-faint)]">Brain dump — nothing is final here.</p>
        </div>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <textarea
            value={concept.brainstorm}
            onChange={(e) => onChange({ ...concept, brainstorm: e.target.value })}
            placeholder="Write freely about your app concept, user flows, ideas, comparisons..."
            className="h-full w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
          />
        </div>
      </div>
      {/* Right: committed */}
      <div className="flex flex-1 flex-col min-h-0">
        <div className="shrink-0 px-6 pt-6 pb-3">
          <h3 className="text-[13px] font-medium text-[var(--text-tertiary)]">Locked-In Concept</h3>
          <p className="mt-0.5 text-xs text-[var(--text-faint)]">The version you&rsquo;re building toward.</p>
        </div>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <textarea
            value={concept.committed}
            onChange={(e) => onChange({ ...concept, committed: e.target.value })}
            placeholder="Write your committed app concept here..."
            className="h-full w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

function ScreensListPanel({
  screens,
  onAdd,
  onRename,
  onDelete,
  onOpen,
}: {
  screens: Screen[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function startRename(screen: Screen) {
    setEditingId(screen.id);
    setEditValue(screen.name);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-8 py-8 max-w-3xl mobile-px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-medium tracking-tight text-[var(--text-primary)]">Screens</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">All screens in your app.</p>
          </div>
          <button
            onClick={onAdd}
            className="rounded-md text-white text-xs font-semibold transition-all hover:brightness-110" style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6 }}
          >
            + Add Screen
          </button>
        </div>

        {screens.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[var(--text-muted)]">No screens yet.</p>
            <button
              onClick={onAdd}
              className="mt-3 text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]"
            >
              Create your first screen
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {screens.map((screen) => (
              <div
                key={screen.id}
                className="group flex items-center rounded-[10px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              >
                {editingId === screen.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                    }}
                    className="flex-1 rounded-md bg-transparent px-4 py-3 text-[13px] text-[var(--text-primary)] focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => onOpen(screen.id)}
                    className="flex-1 px-4 py-3 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {screen.name}
                  </button>
                )}
                <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startRename(screen)}
                    title="Rename"
                    className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(screen.id)}
                    title="Delete"
                    className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-red-400"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Delete screen?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">
              This screen and all its sections will be permanently removed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScreenDetailPanel({
  screen,
  sections,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onOpenSection,
  onBack,
}: {
  screen: Screen;
  sections: Section[];
  onAddSection: () => void;
  onRenameSection: (id: string, name: string) => void;
  onDeleteSection: (id: string) => void;
  onOpenSection: (id: string) => void;
  onBack: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function startRename(section: Section) {
    setEditingId(section.id);
    setEditValue(section.name);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRenameSection(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-8 py-8 max-w-3xl mobile-px-4">
        {/* Breadcrumb */}
        <div className="mb-5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <button onClick={onBack} className="hover:text-[var(--text-tertiary)] transition-colors">Screens</button>
          <span>/</span>
          <span className="text-[var(--text-tertiary)]">{screen.name}</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium tracking-tight text-[var(--text-primary)]">{screen.name}</h2>
          <button
            onClick={onAddSection}
            className="rounded-md text-white text-xs font-semibold transition-all hover:brightness-110" style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6 }}
          >
            + Add Section
          </button>
        </div>

        {sections.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[var(--text-muted)]">No sections yet.</p>
            <button
              onClick={onAddSection}
              className="mt-3 text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]"
            >
              Add the first section
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sections.map((section) => (
              <div
                key={section.id}
                className="group flex items-center rounded-[10px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              >
                {editingId === section.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                    }}
                    className="flex-1 rounded-md bg-transparent px-4 py-3 text-[13px] text-[var(--text-primary)] focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => onOpenSection(section.id)}
                    className="flex-1 px-4 py-3 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {section.name}
                  </button>
                )}
                <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startRename(section)}
                    title="Rename"
                    className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(section.id)}
                    title="Delete"
                    className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-red-400"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Delete section?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">
              This section and its content will be permanently removed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteSection(confirmDeleteId); setConfirmDeleteId(null); }}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionDetailPanel({
  section,
  screenName,
  onChange,
  onBack,
}: {
  section: Section;
  screenName: string;
  onChange: (updated: Section) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Breadcrumb */}
      <div className="shrink-0 px-8 pt-6 pb-3 mobile-px-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <button onClick={onBack} className="hover:text-[var(--text-tertiary)] transition-colors">Screens</button>
          <span>/</span>
          <button onClick={onBack} className="hover:text-[var(--text-tertiary)] transition-colors">{screenName}</button>
          <span>/</span>
          <span className="text-[var(--text-tertiary)]">{section.name}</span>
        </div>
      </div>

      {/* Two-panel workspace */}
      <div className="flex flex-1 min-h-0">
        {/* Left: brainstorm */}
        <div className="flex flex-1 flex-col border-r border-[var(--border-default)] min-h-0">
          <div className="shrink-0 px-6 pt-3 pb-3">
            <h3 className="text-[13px] font-medium text-[var(--text-tertiary)]">Working Ideas</h3>
            <p className="mt-0.5 text-xs text-[var(--text-faint)]">Explore ideas for this section freely.</p>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-6">
            <textarea
              value={section.brainstorm}
              onChange={(e) => onChange({ ...section, brainstorm: e.target.value })}
              placeholder="Brainstorm layout, components, behavior, copy..."
              className="h-full w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
            />
          </div>
        </div>
        {/* Right: committed */}
        <div className="flex flex-1 flex-col min-h-0">
          <div className="shrink-0 px-6 pt-3 pb-3">
            <h3 className="text-[13px] font-medium text-[var(--text-tertiary)]">Committed Design</h3>
            <p className="mt-0.5 text-xs text-[var(--text-faint)]">The finalized spec for this section.</p>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-6">
            <textarea
              value={section.committed}
              onChange={(e) => onChange({ ...section, committed: e.target.value })}
              placeholder="Write the locked-in design for this section..."
              className="h-full w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturesPanel({
  features,
  onAdd,
  onRename,
  onDelete,
  onOpen,
  activeFeatureId,
  onUpdateDescription,
  onBack,
}: {
  features: Feature[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  activeFeatureId?: string;
  onUpdateDescription: (id: string, description: string) => void;
  onBack: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeFeature = activeFeatureId
    ? features.find((f) => f.id === activeFeatureId)
    : null;

  function startRename(feature: Feature) {
    setEditingId(feature.id);
    setEditValue(feature.name);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  }

  if (activeFeature) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 px-8 pt-6 pb-3 mobile-px-4">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <button onClick={onBack} className="hover:text-[var(--text-tertiary)] transition-colors">Features</button>
            <span>/</span>
            <span className="text-[var(--text-tertiary)]">{activeFeature.name}</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 px-8 pb-6 mobile-px-4">
          <textarea
            value={activeFeature.description}
            onChange={(e) => onUpdateDescription(activeFeature.id, e.target.value)}
            placeholder="Describe this feature — what it does, how it works, edge cases, dependencies..."
            className="h-full w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-8 py-8 max-w-3xl mobile-px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-medium tracking-tight text-[var(--text-primary)]">Features</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">App-wide capabilities and functionality.</p>
          </div>
          <button
            onClick={onAdd}
            className="rounded-md text-white text-xs font-semibold transition-all hover:brightness-110" style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6 }}
          >
            + Add Feature
          </button>
        </div>

        {features.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[var(--text-muted)]">No features yet.</p>
            <button
              onClick={onAdd}
              className="mt-3 text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]"
            >
              Add your first feature
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="group flex items-center rounded-[10px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              >
                {editingId === feature.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                    }}
                    className="flex-1 rounded-md bg-transparent px-4 py-3 text-[13px] text-[var(--text-primary)] focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => onOpen(feature.id)}
                    className="flex-1 px-4 py-3 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {feature.name}
                  </button>
                )}
                <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startRename(feature)}
                    title="Rename"
                    className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(feature.id)}
                    title="Delete"
                    className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-red-400"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Delete feature?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">
              This feature will be permanently removed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BuildPlanPanel({
  buildPlan,
  onChange,
}: {
  buildPlan: BuildPlanData;
  onChange: (updated: BuildPlanData) => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-8 pt-8 pb-3 mobile-px-4">
        <h2 className="text-lg font-medium tracking-tight text-[var(--text-primary)]">Build Plan</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Approved milestones, phases, and priorities for development.</p>
      </div>
      <div className="flex-1 min-h-0 px-8 pb-8 mobile-px-4">
        <textarea
          value={buildPlan.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Outline your build plan — phases, milestones, priorities, dependencies..."
          className="h-full w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
        />
      </div>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────── */

export default function AppMode({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { openMainSidebar } = useMainSidebar();
  const [appData, setAppData] = useState<AppData>(EMPTY_APP_DATA);
  const [view, setView] = useState<ViewState>({ page: "App Info" });
  const [displayName, setDisplayName] = useState(projectName);
  const [displayType, setDisplayType] = useState("App");

  // Edit project modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditModal() {
    setEditName(displayName);
    setEditType(displayType);
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!editName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, name: editName.trim(), type: editType }),
    });
    if (res.ok) {
      setDisplayName(editName.trim());
      setDisplayType(editType);
      setShowEditModal(false);
    }
    setSaving(false);
  }
  const [loaded, setLoaded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [view]);

  // Current page for tab highlighting
  const currentPage: PageId = view.page;

  // ─── Load app data from project.book_info.app_data
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.book_info?.app_data) {
          setAppData({ ...EMPTY_APP_DATA, ...data.book_info.app_data });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [projectId]);

  // ─── Auto-save (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // We need to get the current book_info and merge app_data into it
      fetch(`/api/projects/${projectId}`)
        .then((res) => res.json())
        .then((existing) => {
          const bookInfo = existing?.book_info ?? {};
          fetch("/api/projects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: projectId,
              book_info: { ...bookInfo, app_data: appData },
            }),
          });
        });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appData]);

  // ─── Helpers
  const now = () => new Date().toISOString();

  const updateAppData = useCallback((partial: Partial<AppData>) => {
    setAppData((prev) => ({ ...prev, ...partial }));
  }, []);

  // ─── Screen CRUD
  function addScreen() {
    const count = appData.screens.length;
    const screen: Screen = {
      id: crypto.randomUUID(),
      name: `Screen ${count + 1}`,
      createdAt: now(),
      updatedAt: now(),
    };
    updateAppData({ screens: [...appData.screens, screen] });
  }

  function renameScreen(id: string, name: string) {
    updateAppData({
      screens: appData.screens.map((s) =>
        s.id === id ? { ...s, name, updatedAt: now() } : s
      ),
    });
  }

  function deleteScreen(id: string) {
    updateAppData({
      screens: appData.screens.filter((s) => s.id !== id),
      sections: appData.sections.filter((s) => s.screenId !== id),
    });
  }

  // ─── Section CRUD
  function addSection(screenId: string) {
    const screenSections = appData.sections.filter((s) => s.screenId === screenId);
    const section: Section = {
      id: crypto.randomUUID(),
      screenId,
      name: `Section ${screenSections.length + 1}`,
      brainstorm: "",
      committed: "",
      createdAt: now(),
      updatedAt: now(),
    };
    updateAppData({ sections: [...appData.sections, section] });
  }

  function renameSection(id: string, name: string) {
    updateAppData({
      sections: appData.sections.map((s) =>
        s.id === id ? { ...s, name, updatedAt: now() } : s
      ),
    });
  }

  function deleteSection(id: string) {
    updateAppData({
      sections: appData.sections.filter((s) => s.id !== id),
    });
  }

  function updateSection(updated: Section) {
    updateAppData({
      sections: appData.sections.map((s) =>
        s.id === updated.id ? { ...updated, updatedAt: now() } : s
      ),
    });
  }

  // ─── Feature CRUD
  function addFeature() {
    const count = appData.features.length;
    const feature: Feature = {
      id: crypto.randomUUID(),
      name: `Feature ${count + 1}`,
      description: "",
      createdAt: now(),
      updatedAt: now(),
    };
    updateAppData({ features: [...appData.features, feature] });
  }

  function renameFeature(id: string, name: string) {
    updateAppData({
      features: appData.features.map((f) =>
        f.id === id ? { ...f, name, updatedAt: now() } : f
      ),
    });
  }

  function deleteFeature(id: string) {
    updateAppData({
      features: appData.features.filter((f) => f.id !== id),
    });
    if (view.page === "Features" && "featureId" in view && view.featureId === id) {
      setView({ page: "Features" });
    }
  }

  function updateFeatureDescription(id: string, description: string) {
    updateAppData({
      features: appData.features.map((f) =>
        f.id === id ? { ...f, description, updatedAt: now() } : f
      ),
    });
  }

  // ─── Navigation helpers
  function navigateToPage(page: PageId) {
    if (page === "Screens") {
      setView({ page: "Screens" });
    } else if (page === "Features") {
      setView({ page: "Features" });
    } else {
      setView({ page });
    }
  }

  // ─── Sidebar content for Screens drill-down
  function renderSidebar() {
    // Only show sidebar when inside a screen or section
    if (view.page !== "Screens" || !view.screenId) return null;

    const screen = appData.screens.find((s) => s.id === view.screenId);
    if (!screen) return null;
    const screenSections = appData.sections.filter((s) => s.screenId === view.screenId);

    return (
      <aside className={`w-52 shrink-0 border-r border-[var(--border-default)] px-4 py-5 overflow-y-auto ${mobileSidebarOpen ? "" : "mobile-hidden"}`} style={{ background: "var(--surface-1)", zIndex: 41 }}>
        <div className="mb-4 px-2">
          <p className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">{screen.name}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{screenSections.length} section{screenSections.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="mb-4 border-t border-[var(--border-default)]" />
        <nav className="flex flex-col gap-0.5 text-[13px]">
          <button
            onClick={() => setView({ page: "Screens", screenId: view.screenId })}
            className={[
              "w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors",
              !("sectionId" in view) || !view.sectionId
                ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            Overview
          </button>
          {screenSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setView({ page: "Screens", screenId: view.screenId!, sectionId: section.id })}
              className={[
                "w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors",
                "sectionId" in view && view.sectionId === section.id
                  ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              ].join(" ")}
            >
              {section.name}
            </button>
          ))}
        </nav>
      </aside>
    );
  }

  // ─── Main content
  function renderContent() {
    if (view.page === "App Info") {
      return (
        <AppInfoPanel
          appInfo={appData.appInfo}
          onChange={(updated) => updateAppData({ appInfo: updated })}
        />
      );
    }

    if (view.page === "Concept") {
      return (
        <ConceptPanel
          concept={appData.concept}
          onChange={(updated) => updateAppData({ concept: updated })}
        />
      );
    }

    if (view.page === "Screens") {
      // Section detail
      if ("sectionId" in view && view.sectionId) {
        const section = appData.sections.find((s) => s.id === view.sectionId);
        const screen = appData.screens.find((s) => s.id === view.screenId);
        if (section && screen) {
          return (
            <SectionDetailPanel
              section={section}
              screenName={screen.name}
              onChange={updateSection}
              onBack={() => setView({ page: "Screens", screenId: view.screenId! })}
            />
          );
        }
      }

      // Screen detail
      if (view.screenId) {
        const screen = appData.screens.find((s) => s.id === view.screenId);
        if (screen) {
          const screenSections = appData.sections.filter((s) => s.screenId === view.screenId);
          return (
            <ScreenDetailPanel
              screen={screen}
              sections={screenSections}
              onAddSection={() => addSection(view.screenId!)}
              onRenameSection={renameSection}
              onDeleteSection={deleteSection}
              onOpenSection={(id) => setView({ page: "Screens", screenId: view.screenId!, sectionId: id })}
              onBack={() => setView({ page: "Screens" })}
            />
          );
        }
      }

      // Screens list
      return (
        <ScreensListPanel
          screens={appData.screens}
          onAdd={addScreen}
          onRename={renameScreen}
          onDelete={deleteScreen}
          onOpen={(id) => setView({ page: "Screens", screenId: id })}
        />
      );
    }

    if (view.page === "Features") {
      return (
        <FeaturesPanel
          features={appData.features}
          onAdd={addFeature}
          onRename={renameFeature}
          onDelete={deleteFeature}
          onOpen={(id) => setView({ page: "Features", featureId: id })}
          activeFeatureId={"featureId" in view ? view.featureId : undefined}
          onUpdateDescription={updateFeatureDescription}
          onBack={() => setView({ page: "Features" })}
        />
      );
    }

    if (view.page === "Build Plan") {
      return (
        <BuildPlanPanel
          buildPlan={appData.buildPlan}
          onChange={(updated) => updateAppData({ buildPlan: updated })}
        />
      );
    }

    return null;
  }

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Project header bar */}
      <div
        className="flex shrink-0 items-center gap-4 mobile-px-4"
        style={{ height: 48, padding: "0 24px", background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* Hamburger menu — opens main sidebar */}
        <button
          className="flex items-center justify-center"
          onClick={openMainSidebar}
          style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
          aria-label="Open navigation"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>
        <span className="text-[18px] mobile-text-15 font-bold" style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {displayName}
        </span>
        <span
          className="mobile-hidden"
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 3,
            background: displayType === "App" ? "rgba(139,124,245,0.18)" : displayType === "Book" ? "rgba(74,222,128,0.18)" : displayType === "Music" ? "rgba(90,154,245,0.18)" : "rgba(251,191,36,0.18)",
            color: displayType === "App" ? "#8b7cf5" : displayType === "Book" ? "#4ade80" : displayType === "Music" ? "#5a9af5" : "#fbbf24",
          }}
        >
          {displayType}
        </span>
        <button
          onClick={openEditModal}
          className="text-[12px] font-medium transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          Edit
        </button>
        {/* Spacer */}
        <div style={{ flex: 1 }} />
        {/* Exit link */}
        <Link
          href="/"
          className="text-[13px] font-medium transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          Exit
        </Link>
      </div>

      {/* Page navigation tabs */}
      <div className="flex shrink-0 gap-1 border-b border-[var(--border-default)] px-8 pb-3 mobile-px-4" style={{ overflowX: "auto" }}>
        {PAGES.map((page) => (
          <button
            key={page}
            onClick={() => navigateToPage(page)}
            className={[
              "rounded-t px-3 pb-3.5 pt-3 text-[13px] transition-colors",
              currentPage === page
                ? "border-b-2 border-[var(--accent-blue)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-tertiary)]",
            ].join(" ")}
          >
            {page}
          </button>
        ))}
      </div>

      {/* Body: optional sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="desktop-hidden"
            style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }}
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        {renderSidebar()}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {renderContent()}
        </div>
      </div>

      {/* Edit project modal */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="w-full"
            style={{ maxWidth: 420, margin: "0 16px", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "20px 24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Edit Project</h2>

            <div className="flex gap-6 mb-4" style={{ alignItems: "center" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 80, letterSpacing: "0.06em", color: "var(--text-muted)" }}>Name</label>
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                className="flex-1 text-[13px]"
                style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", outline: "none", transition: "border-color 0.15s" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(90,154,245,0.35)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
              />
            </div>

            <div className="flex gap-6 mb-6" style={{ alignItems: "center" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 80, letterSpacing: "0.06em", color: "var(--text-muted)" }}>Type</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="flex-1 text-[13px]"
                style={{
                  appearance: "none",
                  padding: "7px 28px 7px 10px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  outline: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.3)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                }}
              >
                {(["Book", "App", "Business", "Music"] as const).map((t) => (
                  <option key={t} value={t} style={{ background: "var(--surface-2)" }}>{t}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="text-xs font-medium"
                style={{ height: 28, padding: "0 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-secondary)", transition: "all 0.12s" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || saving}
                className="text-xs font-semibold text-white whitespace-nowrap"
                style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6, opacity: !editName.trim() || saving ? 0.35 : 1, cursor: !editName.trim() || saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
