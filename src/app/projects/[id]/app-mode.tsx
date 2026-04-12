"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useMainSidebar } from "@/components/layout/sidebar-context";
import { useModes } from "@/components/layout/modes-context";
import { loadAIEngineConfig, type ChatHistoryEntry } from "@/lib/ai-engine";

/* ─── types ──────────────────────────────────────────────────────── */

type AppOverview = {
  appName: string;
  goal: string;
  targetUser: string;
  problemSolved: string;
  keyFeatures: string;
};

const EMPTY_OVERVIEW: AppOverview = {
  appName: "",
  goal: "",
  targetUser: "",
  problemSolved: "",
  keyFeatures: "",
};

type AppPage = {
  id: string;
  name: string;
  components: string;
  notes: string;
};

type AppFeature = {
  id: string;
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  logic: string;
};

type BuildFeatureData = {
  logic: string;
  code: string;
  notes: string;
};

type DeployData = {
  envVariables: string;
  dbSetup: string;
  apiKeys: string;
  readme: string;
  versionNotes: string;
};

type AppData = {
  overview: AppOverview;
  pages: AppPage[];
  features: AppFeature[];
  build: Record<string, BuildFeatureData>;
  deploy: DeployData;
};

const EMPTY_APP_DATA: AppData = {
  overview: EMPTY_OVERVIEW,
  pages: [],
  features: [],
  build: {},
  deploy: { envVariables: "", dbSetup: "", apiKeys: "", readme: "", versionNotes: "" },
};

/* ─── AI message types (mirrors book mode) ──────────────────────── */

type AiMessage = {
  id: number;
  db_id: string | null;
  role: "user" | "ai";
  text: string;
  is_favorite: boolean;
  is_liked: boolean;
  is_disliked: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
  created_at: Date;
};

function newAiMsg(id: number, role: "user" | "ai", text: string, db_id?: string | null): AiMessage {
  return { id, role, text, db_id: db_id ?? null, is_favorite: false, is_liked: false, is_disliked: false, is_hidden: false, is_deleted: false, created_at: new Date() };
}

type AiFilter = "brainstorm" | "favorites" | "liked" | "disliked" | "hidden" | "trash";

const AI_FILTERS: { key: AiFilter; label: string }[] = [
  { key: "brainstorm", label: "Brainstorm" },
  { key: "favorites", label: "Favorites" },
  { key: "liked", label: "Liked" },
  { key: "disliked", label: "Disliked" },
  { key: "hidden", label: "Hidden" },
  { key: "trash", label: "Trash" },
];

function filterMsgs(messages: AiMessage[], filter: AiFilter): AiMessage[] {
  switch (filter) {
    case "brainstorm": return messages.filter((m) => !m.is_hidden && !m.is_deleted);
    case "favorites": return messages.filter((m) => m.is_favorite && !m.is_deleted);
    case "liked": return messages.filter((m) => m.is_liked && !m.is_deleted);
    case "disliked": return messages.filter((m) => m.is_disliked && !m.is_deleted);
    case "hidden": return messages.filter((m) => m.is_hidden && !m.is_deleted);
    case "trash": return messages.filter((m) => m.is_deleted);
    default: return messages;
  }
}

/* ─── pages ─────────────────────────────────────────────────────── */

const PAGES = ["Overview", "Structure", "Features", "Build", "Deploy"] as const;
type PageId = (typeof PAGES)[number];

/* ─── view stack ────────────────────────────────────────────────── */

type ViewState =
  | { page: "Overview" }
  | { page: "Structure"; pageId?: string }
  | { page: "Features"; featureId?: string }
  | { page: "Build" }
  | { page: "Deploy" };

/* ─── shared input/textarea classes ─────────────────────────────── */

const inputCls = "w-full rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors";
const textareaCls = inputCls + " resize-none";

/* ─── AI Action Bar ─────────────────────────────────────────────── */

function AiActionBar({ message, onUpdate }: { message: AiMessage; onUpdate: (u: AiMessage) => void }) {
  function toggle(field: "is_favorite" | "is_liked" | "is_disliked" | "is_hidden" | "is_deleted") {
    const updated = { ...message, [field]: !message[field] };
    if (field === "is_liked" && updated.is_liked) updated.is_disliked = false;
    if (field === "is_disliked" && updated.is_disliked) updated.is_liked = false;
    onUpdate(updated);
  }
  const ac = "var(--text-primary)";
  const ic = "var(--text-faint)";
  const bc = "transition-colors";
  return (
    <div className="mt-2 flex items-center gap-3">
      <button title="Copy" className={bc} style={{ color: ic }} onClick={() => navigator.clipboard.writeText(message.text)} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")} onMouseLeave={(e) => (e.currentTarget.style.color = ic)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      <button title="Favorite" className={bc} style={{ color: message.is_favorite ? "#fbbf24" : ic }} onClick={() => toggle("is_favorite")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      </button>
      <button title="Like" className={bc} style={{ color: message.is_liked ? ac : ic }} onClick={() => toggle("is_liked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
      </button>
      <button title="Dislike" className={bc} style={{ color: message.is_disliked ? ac : ic }} onClick={() => toggle("is_disliked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
      </button>
      <button title="Hide" className={bc} style={{ color: message.is_hidden ? ac : ic }} onClick={() => toggle("is_hidden")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      </button>
      <button title="Delete" className={bc} style={{ color: message.is_deleted ? "#ef4444" : ic }} onClick={() => toggle("is_deleted")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
      <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>
        {message.created_at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ─── AI Chat Panel (reusable) ──────────────────────────────────── */

function AppAiPanel({
  messages,
  onAddMessage,
  onUpdateMessage,
  projectId,
  appName,
  contextLabel,
  stage,
}: {
  messages: AiMessage[];
  onAddMessage: (msg: AiMessage) => void;
  onUpdateMessage: (msg: AiMessage) => void;
  projectId: string;
  appName: string;
  contextLabel: string;
  stage: string;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AiFilter>("brainstorm");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    const trimmed = input.trim();
    const userMsgLocalId = Date.now();
    onAddMessage(newAiMsg(userMsgLocalId, "user", trimmed));
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);
    try {
      const recentHistory: ChatHistoryEntry[] = messages
        .filter((m) => !m.is_deleted && !m.is_hidden)
        .slice(-10)
        .map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, text: m.text }));

      const aiEngine = await loadAIEngineConfig();

      const payload = {
        message: trimmed,
        project_id: projectId,
        chapter: contextLabel,
        bookTitle: appName,
        mode: "App",
        page: stage,
        aiEngine,
        history: recentHistory,
        projectContext: { title: appName },
        workContext: { currentPage: stage },
      };

      const res = await fetch("/api/brainstorm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      onAddMessage(newAiMsg(Date.now() + 1, "ai", res.ok && data.reply ? data.reply : "I couldn't generate a response right now. Please try again.", data.aiMsgId));
      if (data.userMsgId) {
        onUpdateMessage({ ...newAiMsg(userMsgLocalId, "user", trimmed, data.userMsgId) });
      }
    } catch { onAddMessage(newAiMsg(Date.now() + 1, "ai", "I couldn't generate a response right now. Please try again.")); }
    finally { setLoading(false); }
  }

  const filtered = filterMsgs(messages, activeFilter);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center px-4 pt-3 pb-2 border-b border-[var(--border-default)]" style={{ height: 46 }}>
        <span className="text-[12px] font-medium shrink-0 mr-auto" style={{ color: "var(--text-faint)" }}>AI Assistant</span>
        <div className="flex items-center gap-1" style={{ overflowX: "auto" }}>
          {AI_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${activeFilter === f.key ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-5 pb-4">
          {filtered.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end items-start gap-1.5 group/user">
                  <button onClick={() => onUpdateMessage({ ...msg, is_hidden: true })} title="Hide" className="shrink-0 mt-2.5 opacity-0 group-hover/user:opacity-100 transition-opacity" style={{ width: 20, height: 20, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-faint)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  </button>
                  <button onClick={() => onUpdateMessage({ ...msg, is_deleted: true })} title="Delete" className="shrink-0 mt-2.5 opacity-0 group-hover/user:opacity-100 transition-opacity" style={{ width: 20, height: 20, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-faint)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                  <p className="max-w-[85%] rounded-lg bg-[var(--overlay-active)] px-4 py-2.5 text-[13px] text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p>
                </div>
              ) : (
                <div>
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p>
                  <AiActionBar message={msg} onUpdate={onUpdateMessage} />
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <p className="text-[12px] text-[var(--text-faint)] text-center py-8">
              {activeFilter === "brainstorm" ? "Start a conversation with your AI assistant." : `No ${activeFilter} messages.`}
            </p>
          )}
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-faint)] animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-faint)] animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-faint)] animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
              </div>
              <span className="text-[12px] text-[var(--text-faint)]">AI is thinking...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0" style={{ padding: "8px 14px 10px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
        <div className="flex items-end gap-2 transition-colors focus-within:border-[rgba(90,154,245,0.3)]" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 20, padding: "3px 8px 3px 12px" }}>
          <span style={{ color: "var(--text-faint)", fontSize: 16, flexShrink: 0, lineHeight: 1, paddingBottom: 6 }}>+</span>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask about your app, brainstorm features, get guidance..."
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-faint)] resize-none"
            style={{ padding: "5px 0", fontFamily: "inherit", maxHeight: 120, overflowY: "auto", lineHeight: "1.5" }}
          />
          {loading ? (
            <div className="flex items-center justify-center" style={{ width: 24, height: 24, flexShrink: 0 }}>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-tertiary)]" />
            </div>
          ) : (
            <button type="button" aria-label="Send" onClick={handleSubmit} disabled={!input.trim()} className="flex items-center justify-center transition-colors" style={{ width: 24, height: 24, borderRadius: "50%", border: "none", flexShrink: 0, cursor: input.trim() ? "pointer" : "default", fontSize: 12, background: input.trim() ? "#fff" : "transparent", color: input.trim() ? "var(--surface-1)" : "var(--text-faint)" }}>
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── helper text banner ────────────────────────────────────────── */

function HelperBanner({ text }: { text: string }) {
  return (
    <div className="shrink-0 px-6 py-2" style={{ background: "rgba(90,154,245,0.06)", borderTop: "1px solid var(--border-subtle)" }}>
      <p className="text-[11px] font-medium" style={{ color: "rgba(90,154,245,0.8)" }}>{text}</p>
    </div>
  );
}

/* ─── confirm delete modal ──────────────────────────────────────── */

function ConfirmDeleteModal({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Delete {label}?</h2>
        <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">This will be permanently removed.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─── 1. OVERVIEW PAGE ──────────────────────────────────────────── */

function OverviewPanel({
  overview,
  onChange,
  aiMessages,
  onAddAiMessage,
  onUpdateAiMessage,
  projectId,
}: {
  overview: AppOverview;
  onChange: (updated: AppOverview) => void;
  aiMessages: AiMessage[];
  onAddAiMessage: (msg: AiMessage) => void;
  onUpdateAiMessage: (msg: AiMessage) => void;
  projectId: string;
}) {
  const fields: { key: keyof AppOverview; label: string; multiline?: boolean; placeholder: string }[] = [
    { key: "appName", label: "App Name", placeholder: "e.g. TaskFlow" },
    { key: "goal", label: "Goal", placeholder: "What does this app accomplish?" },
    { key: "targetUser", label: "Target User", placeholder: "e.g. Freelancers managing multiple clients" },
    { key: "problemSolved", label: "Problem", multiline: true, placeholder: "What pain point does this app eliminate?" },
    { key: "keyFeatures", label: "Key Features", multiline: true, placeholder: "List the core features of your app" },
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* Left: form */}
      <div className="flex-1 overflow-y-auto border-r border-[var(--border-default)]">
        <div className="px-8 py-8 mobile-px-4" style={{ maxWidth: 720 }}>
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Overview</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Core details about your app — keep it sharp.</p>
          <div className="mt-7 flex flex-col gap-5">
            {fields.map(({ key, label, multiline, placeholder }) => (
              <div key={key} className="flex gap-6 mobile-stack" style={{ alignItems: multiline ? "flex-start" : "center" }}>
                <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: multiline ? 10 : 0, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                  {label}
                </label>
                <div className="flex-1">
                  {multiline ? (
                    <textarea rows={3} value={overview[key]} onChange={(e) => onChange({ ...overview, [key]: e.target.value })} placeholder={placeholder} className={textareaCls} />
                  ) : (
                    <input type="text" value={overview[key]} onChange={(e) => onChange({ ...overview, [key]: e.target.value })} placeholder={placeholder} className={inputCls} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <HelperBanner text="Next: Define your structure →" />
      </div>
      {/* Right: AI panel */}
      <div className="w-[380px] shrink-0 mobile-hidden" style={{ minWidth: 300 }}>
        <AppAiPanel
          messages={aiMessages}
          onAddMessage={onAddAiMessage}
          onUpdateMessage={onUpdateAiMessage}
          projectId={projectId}
          appName={overview.appName || "My App"}
          contextLabel="overview"
          stage="overview"
        />
      </div>
    </div>
  );
}

/* ─── 2. STRUCTURE PAGE ─────────────────────────────────────────── */

function StructureListPanel({
  pages,
  onAdd,
  onRename,
  onDelete,
  onOpen,
}: {
  pages: AppPage[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function startRename(p: AppPage) { setEditingId(p.id); setEditValue(p.name); }
  function commitRename() {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null); setEditValue("");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-3xl mobile-px-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-medium tracking-tight text-[var(--text-primary)]">Structure</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">All pages in your app.</p>
            </div>
            <button onClick={onAdd} className="rounded-md text-white text-xs font-semibold transition-all hover:brightness-110" style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6 }}>
              + Add Page
            </button>
          </div>

          {pages.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[var(--text-muted)]">No pages yet.</p>
              <button onClick={onAdd} className="mt-3 text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]">
                Create your first page
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {pages.map((p) => (
                <div key={p.id} className="group flex items-center rounded-[10px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                  {editingId === p.id ? (
                    <input autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditingId(null); setEditValue(""); } }} className="flex-1 rounded-md bg-transparent px-4 py-3 text-[13px] text-[var(--text-primary)] focus:outline-none" />
                  ) : (
                    <button onClick={() => onOpen(p.id)} className="flex-1 px-4 py-3 text-left text-[13px] font-medium text-[var(--text-primary)]">
                      {p.name}
                    </button>
                  )}
                  <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startRename(p)} title="Rename" className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button onClick={() => setConfirmDeleteId(p.id)} title="Delete" className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-red-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <HelperBanner text="Next: Break into features →" />
      {confirmDeleteId && <ConfirmDeleteModal label="page" onCancel={() => setConfirmDeleteId(null)} onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }} />}
    </div>
  );
}

function StructureDetailPanel({
  page,
  onChange,
  onBack,
}: {
  page: AppPage;
  onChange: (updated: AppPage) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-8 pt-6 pb-3 mobile-px-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <button onClick={onBack} className="hover:text-[var(--text-tertiary)] transition-colors">Structure</button>
          <span>/</span>
          <span className="text-[var(--text-tertiary)]">{page.name}</span>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 mobile-stack">
        {/* Left: components */}
        <div className="flex flex-1 flex-col border-r border-[var(--border-default)] min-h-0">
          <div className="shrink-0 px-6 pt-3 pb-3">
            <h3 className="text-[13px] font-medium text-[var(--text-tertiary)]">Components</h3>
            <p className="mt-0.5 text-xs text-[var(--text-faint)]">UI elements and sections on this page.</p>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-6">
            <textarea value={page.components} onChange={(e) => onChange({ ...page, components: e.target.value })} placeholder="List the components on this page (e.g. Header, Search Bar, Card Grid, Footer)..." className={textareaCls + " h-full"} />
          </div>
        </div>
        {/* Right: notes */}
        <div className="flex flex-1 flex-col min-h-0">
          <div className="shrink-0 px-6 pt-3 pb-3">
            <h3 className="text-[13px] font-medium text-[var(--text-tertiary)]">Notes</h3>
            <p className="mt-0.5 text-xs text-[var(--text-faint)]">Behavior, layout, or design notes.</p>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-6">
            <textarea value={page.notes} onChange={(e) => onChange({ ...page, notes: e.target.value })} placeholder="Notes about this page — layout, interactions, edge cases..." className={textareaCls + " h-full"} />
          </div>
        </div>
      </div>
      <HelperBanner text="Next: Break into features →" />
    </div>
  );
}

/* ─── 3. FEATURES PAGE ──────────────────────────────────────────── */

function FeaturesListPanel({
  features,
  onAdd,
  onRename,
  onDelete,
  onOpen,
}: {
  features: AppFeature[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function startRename(f: AppFeature) { setEditingId(f.id); setEditValue(f.name); }
  function commitRename() {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null); setEditValue("");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-3xl mobile-px-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-medium tracking-tight text-[var(--text-primary)]">Features</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">App-wide capabilities and functionality.</p>
            </div>
            <button onClick={onAdd} className="rounded-md text-white text-xs font-semibold transition-all hover:brightness-110" style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6 }}>
              + Add Feature
            </button>
          </div>

          {features.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[var(--text-muted)]">No features yet.</p>
              <button onClick={onAdd} className="mt-3 text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]">
                Add your first feature
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {features.map((f) => (
                <div key={f.id} className="group flex items-center rounded-[10px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                  {editingId === f.id ? (
                    <input autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditingId(null); setEditValue(""); } }} className="flex-1 rounded-md bg-transparent px-4 py-3 text-[13px] text-[var(--text-primary)] focus:outline-none" />
                  ) : (
                    <button onClick={() => onOpen(f.id)} className="flex-1 px-4 py-3 text-left text-[13px] font-medium text-[var(--text-primary)]">
                      {f.name}
                    </button>
                  )}
                  <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startRename(f)} title="Rename" className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button onClick={() => setConfirmDeleteId(f.id)} title="Delete" className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-red-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <HelperBanner text="Next: Send feature to build →" />
      {confirmDeleteId && <ConfirmDeleteModal label="feature" onCancel={() => setConfirmDeleteId(null)} onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }} />}
    </div>
  );
}

function FeatureDetailPanel({
  feature,
  onChange,
  onBack,
}: {
  feature: AppFeature;
  onChange: (updated: AppFeature) => void;
  onBack: () => void;
}) {
  const fields: { key: keyof AppFeature; label: string; multiline?: boolean; placeholder: string }[] = [
    { key: "description", label: "Description", multiline: true, placeholder: "What does this feature do?" },
    { key: "inputs", label: "Inputs", multiline: true, placeholder: "What data or actions trigger this feature?" },
    { key: "outputs", label: "Outputs", multiline: true, placeholder: "What does this feature produce or display?" },
    { key: "logic", label: "Logic", multiline: true, placeholder: "How does this feature work? Rules, conditions, edge cases..." },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-8 pt-6 pb-3 mobile-px-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <button onClick={onBack} className="hover:text-[var(--text-tertiary)] transition-colors">Features</button>
          <span>/</span>
          <span className="text-[var(--text-tertiary)]">{feature.name}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8 mobile-px-4" style={{ maxWidth: 720 }}>
          <div className="flex flex-col gap-5 mt-4">
            {fields.map(({ key, label, multiline, placeholder }) => (
              <div key={key}>
                <label className="text-[11px] font-semibold uppercase block mb-1.5" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</label>
                {multiline ? (
                  <textarea rows={4} value={feature[key]} onChange={(e) => onChange({ ...feature, [key]: e.target.value })} placeholder={placeholder} className={textareaCls} />
                ) : (
                  <input type="text" value={feature[key]} onChange={(e) => onChange({ ...feature, [key]: e.target.value })} placeholder={placeholder} className={inputCls} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <HelperBanner text="Next: Send feature to build →" />
    </div>
  );
}

/* ─── 4. BUILD PAGE ─────────────────────────────────────────────── */

const BUILD_TABS = ["Logic", "Code", "Notes"] as const;
type BuildTab = (typeof BUILD_TABS)[number];

function BuildPanel({
  features,
  buildData,
  onChangeBuild,
  aiMessages,
  onAddAiMessage,
  onUpdateAiMessage,
  projectId,
  appName,
}: {
  features: AppFeature[];
  buildData: Record<string, BuildFeatureData>;
  onChangeBuild: (featureId: string, data: BuildFeatureData) => void;
  aiMessages: AiMessage[];
  onAddAiMessage: (msg: AiMessage) => void;
  onUpdateAiMessage: (msg: AiMessage) => void;
  projectId: string;
  appName: string;
}) {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>(features[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<BuildTab>("Logic");

  const selectedFeature = features.find((f) => f.id === selectedFeatureId);
  const data = selectedFeatureId ? (buildData[selectedFeatureId] ?? { logic: "", code: "", notes: "" }) : { logic: "", code: "", notes: "" };

  function updateField(field: keyof BuildFeatureData, value: string) {
    if (!selectedFeatureId) return;
    onChangeBuild(selectedFeatureId, { ...data, [field]: value });
  }

  if (features.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <p className="text-[var(--text-muted)] text-[13px]">Add features first to start building.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left: feature content */}
      <div className="flex-1 flex flex-col min-h-0 border-r border-[var(--border-default)]">
        {/* Feature selector */}
        <div className="shrink-0 px-6 pt-5 pb-3 border-b border-[var(--border-default)]">
          <label className="text-[10px] font-semibold uppercase block mb-1.5" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>Feature</label>
          <select
            value={selectedFeatureId}
            onChange={(e) => { setSelectedFeatureId(e.target.value); setActiveTab("Logic"); }}
            className="w-full text-[13px]"
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
            {features.map((f) => (
              <option key={f.id} value={f.id} style={{ background: "var(--surface-2)" }}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 px-6 pt-3 border-b border-[var(--border-default)]">
          {BUILD_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-t px-3 pb-3 pt-2 text-[12px] font-medium transition-colors ${activeTab === tab ? "border-b-2 border-[var(--accent-blue)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`}
              style={{ marginBottom: -1 }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 px-6 py-4">
          {selectedFeature && (
            <>
              {activeTab === "Logic" && (
                <textarea
                  value={data.logic || selectedFeature.logic}
                  onChange={(e) => updateField("logic", e.target.value)}
                  placeholder="Describe the logic for this feature — rules, conditions, flows..."
                  className={textareaCls + " h-full"}
                />
              )}
              {activeTab === "Code" && (
                <textarea
                  value={data.code}
                  onChange={(e) => updateField("code", e.target.value)}
                  placeholder="Paste or write code for this feature..."
                  className={textareaCls + " h-full"}
                  style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                />
              )}
              {activeTab === "Notes" && (
                <textarea
                  value={data.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Dev notes, TODOs, blockers, decisions..."
                  className={textareaCls + " h-full"}
                />
              )}
            </>
          )}
        </div>
        <HelperBanner text="Build feature with AI →" />
      </div>

      {/* Right: AI panel */}
      <div className="w-[380px] shrink-0 mobile-hidden" style={{ minWidth: 300 }}>
        <AppAiPanel
          messages={aiMessages}
          onAddMessage={onAddAiMessage}
          onUpdateMessage={onUpdateAiMessage}
          projectId={projectId}
          appName={appName}
          contextLabel={`build_${selectedFeatureId}`}
          stage="build"
        />
      </div>
    </div>
  );
}

/* ─── 5. DEPLOY PAGE ────────────────────────────────────────────── */

function DeployPanel({
  deploy,
  onChange,
}: {
  deploy: DeployData;
  onChange: (updated: DeployData) => void;
}) {
  const sections: { key: keyof DeployData; label: string; heading: string; placeholder: string }[] = [
    { key: "envVariables", heading: "Setup", label: "Environment Variables", placeholder: "List env variables needed (e.g. DATABASE_URL, API_KEY, SECRET)..." },
    { key: "dbSetup", heading: "Setup", label: "Database Setup", placeholder: "Describe the database schema, migrations, seed data..." },
    { key: "apiKeys", heading: "Setup", label: "API Keys", placeholder: "List required API keys and where to obtain them..." },
    { key: "readme", heading: "Output", label: "README", placeholder: "Project README content..." },
    { key: "versionNotes", heading: "Output", label: "Version Notes", placeholder: "Release notes for this version..." },
  ];

  // Group by heading
  const groups: Record<string, typeof sections> = {};
  for (const s of sections) {
    if (!groups[s.heading]) groups[s.heading] = [];
    groups[s.heading].push(s);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 mobile-px-4" style={{ maxWidth: 800 }}>
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Deploy</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Finalize configuration, outputs, and deployment details.</p>

          {Object.entries(groups).map(([heading, fields]) => (
            <div key={heading} className="mt-8">
              <h3 className="text-[13px] font-semibold uppercase mb-4" style={{ letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>{heading}</h3>
              <div className="flex flex-col gap-5">
                {fields.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-[11px] font-semibold uppercase block mb-1.5" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</label>
                    <textarea
                      rows={4}
                      value={deploy[key]}
                      onChange={(e) => onChange({ ...deploy, [key]: e.target.value })}
                      placeholder={placeholder}
                      className={textareaCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Action buttons */}
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => {
                if (!deploy.readme) onChange({ ...deploy, readme: `# ${deploy.envVariables ? "App" : "My App"}\n\n## Setup\n\n## Usage\n\n## License` });
              }}
              className="rounded-md text-white text-xs font-semibold transition-all hover:brightness-110"
              style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6 }}
            >
              Generate README
            </button>
            <button
              onClick={() => {
                if (!deploy.versionNotes) onChange({ ...deploy, versionNotes: `## v1.0.0\n\n- Initial release\n- Core features implemented` });
              }}
              className="rounded-md text-xs font-semibold transition-all hover:brightness-110"
              style={{ height: 30, padding: "0 12px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-secondary)" }}
            >
              Generate Version Notes
            </button>
          </div>
        </div>
      </div>
      <HelperBanner text="Finalize and deploy →" />
    </div>
  );
}

/* ─── MAIN COMPONENT ────────────────────────────────────────────── */

export default function AppMode({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { openMainSidebar } = useMainSidebar();
  const { enabledModes } = useModes();
  const [appData, setAppData] = useState<AppData>(EMPTY_APP_DATA);
  const [view, setView] = useState<ViewState>({ page: "Overview" });
  const [displayName, setDisplayName] = useState(projectName);
  const [displayType, setDisplayType] = useState("App");
  const [loaded, setLoaded] = useState(false);

  // AI messages keyed by context (overview, build_featureId, etc.)
  const [aiMessages, setAiMessages] = useState<Record<string, AiMessage[]>>({});

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

  // Close mobile sidebar on navigation
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  useEffect(() => { setMobileSidebarOpen(false); }, [view]);

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

  // ─── Load AI messages
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;
        const grouped: Record<string, typeof data> = {};
        for (const row of data) {
          const ch = row.chapter_id ?? "default";
          if (!grouped[ch]) grouped[ch] = [];
          grouped[ch].push(row);
        }
        const loaded: Record<string, AiMessage[]> = {};
        for (const [ch, rows] of Object.entries(grouped)) {
          loaded[ch] = rows.map((row: Record<string, unknown>, i: number) => {
            const msg = newAiMsg(i + 1, (row.role === "assistant" ? "ai" : "user") as AiMessage["role"], row.message as string, row.id as string);
            msg.is_favorite = !!row.is_favorite;
            msg.is_liked = !!row.is_liked;
            msg.is_disliked = !!row.is_disliked;
            msg.is_hidden = !!row.is_hidden;
            msg.is_deleted = !!row.is_deleted;
            return msg;
          });
        }
        setAiMessages((prev) => {
          const merged = { ...prev };
          for (const [ch, msgs] of Object.entries(loaded)) {
            if (!merged[ch] || merged[ch].length === 0) merged[ch] = msgs;
          }
          return merged;
        });
      })
      .catch(() => {});
  }, [projectId]);

  // ─── Auto-save (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    if (!loadedRef.current) { loadedRef.current = true; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}`)
        .then((res) => res.json())
        .then((existing) => {
          const bookInfo = existing?.book_info ?? {};
          fetch("/api/projects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: projectId, book_info: { ...bookInfo, app_data: appData } }),
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

  // ─── AI message helpers
  function getAiMsgs(key: string): AiMessage[] { return aiMessages[key] ?? []; }

  function addAiMsg(key: string, msg: AiMessage) {
    setAiMessages((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg] }));
  }

  function updateAiMsg(key: string, msg: AiMessage) {
    setAiMessages((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((m) => (m.id === msg.id ? msg : m)),
    }));
    // Persist flag changes to DB
    if (msg.db_id) {
      fetch(`/api/projects/${projectId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: msg.db_id,
          is_favorite: msg.is_favorite,
          is_liked: msg.is_liked,
          is_disliked: msg.is_disliked,
          is_hidden: msg.is_hidden,
          is_deleted: msg.is_deleted,
        }),
      });
    }
  }

  // ─── Page CRUD
  function addPage() {
    const count = appData.pages.length;
    const page: AppPage = { id: crypto.randomUUID(), name: `Page ${count + 1}`, components: "", notes: "" };
    updateAppData({ pages: [...appData.pages, page] });
  }

  function renamePage(id: string, name: string) {
    updateAppData({ pages: appData.pages.map((p) => p.id === id ? { ...p, name } : p) });
  }

  function deletePage(id: string) {
    updateAppData({ pages: appData.pages.filter((p) => p.id !== id) });
    if (view.page === "Structure" && "pageId" in view && view.pageId === id) setView({ page: "Structure" });
  }

  function updatePage(updated: AppPage) {
    updateAppData({ pages: appData.pages.map((p) => p.id === updated.id ? updated : p) });
  }

  // ─── Feature CRUD
  function addFeature() {
    const count = appData.features.length;
    const feature: AppFeature = { id: crypto.randomUUID(), name: `Feature ${count + 1}`, description: "", inputs: "", outputs: "", logic: "" };
    updateAppData({ features: [...appData.features, feature] });
  }

  function renameFeature(id: string, name: string) {
    updateAppData({ features: appData.features.map((f) => f.id === id ? { ...f, name } : f) });
  }

  function deleteFeature(id: string) {
    updateAppData({ features: appData.features.filter((f) => f.id !== id) });
    if (view.page === "Features" && "featureId" in view && view.featureId === id) setView({ page: "Features" });
  }

  function updateFeature(updated: AppFeature) {
    updateAppData({ features: appData.features.map((f) => f.id === updated.id ? updated : f) });
  }

  // ─── Build data
  function updateBuildData(featureId: string, data: BuildFeatureData) {
    updateAppData({ build: { ...appData.build, [featureId]: data } });
  }

  // ─── Navigation
  function navigateToPage(page: PageId) {
    if (page === "Structure") setView({ page: "Structure" });
    else if (page === "Features") setView({ page: "Features" });
    else setView({ page });
  }

  // ─── Render content
  function renderContent() {
    if (view.page === "Overview") {
      return (
        <OverviewPanel
          overview={appData.overview}
          onChange={(updated) => updateAppData({ overview: updated })}
          aiMessages={getAiMsgs("overview")}
          onAddAiMessage={(msg) => addAiMsg("overview", msg)}
          onUpdateAiMessage={(msg) => updateAiMsg("overview", msg)}
          projectId={projectId}
        />
      );
    }

    if (view.page === "Structure") {
      if ("pageId" in view && view.pageId) {
        const page = appData.pages.find((p) => p.id === view.pageId);
        if (page) {
          return (
            <StructureDetailPanel
              page={page}
              onChange={updatePage}
              onBack={() => setView({ page: "Structure" })}
            />
          );
        }
      }
      return (
        <StructureListPanel
          pages={appData.pages}
          onAdd={addPage}
          onRename={renamePage}
          onDelete={deletePage}
          onOpen={(id) => setView({ page: "Structure", pageId: id })}
        />
      );
    }

    if (view.page === "Features") {
      if ("featureId" in view && view.featureId) {
        const feature = appData.features.find((f) => f.id === view.featureId);
        if (feature) {
          return (
            <FeatureDetailPanel
              feature={feature}
              onChange={updateFeature}
              onBack={() => setView({ page: "Features" })}
            />
          );
        }
      }
      return (
        <FeaturesListPanel
          features={appData.features}
          onAdd={addFeature}
          onRename={renameFeature}
          onDelete={deleteFeature}
          onOpen={(id) => setView({ page: "Features", featureId: id })}
        />
      );
    }

    if (view.page === "Build") {
      return (
        <BuildPanel
          features={appData.features}
          buildData={appData.build}
          onChangeBuild={updateBuildData}
          aiMessages={getAiMsgs("build")}
          onAddAiMessage={(msg) => addAiMsg("build", msg)}
          onUpdateAiMessage={(msg) => updateAiMsg("build", msg)}
          projectId={projectId}
          appName={appData.overview.appName || displayName}
        />
      );
    }

    if (view.page === "Deploy") {
      return (
        <DeployPanel
          deploy={appData.deploy}
          onChange={(updated) => updateAppData({ deploy: updated })}
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
        <button className="flex items-center justify-center" onClick={openMainSidebar} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }} aria-label="Open navigation">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
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
            background: "rgba(139,124,245,0.18)",
            color: "#8b7cf5",
          }}
        >
          App
        </span>
        <button onClick={openEditModal} className="text-[12px] font-medium transition-colors" style={{ color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
          Edit
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/" className="text-[13px] font-medium transition-colors" style={{ color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
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

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>

      {/* Edit project modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => setShowEditModal(false)}>
          <div className="w-full" style={{ maxWidth: 420, margin: "0 16px", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "20px 24px" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-5 text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Edit Project</h2>
            <div className="flex gap-6 mb-4" style={{ alignItems: "center" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 80, letterSpacing: "0.06em", color: "var(--text-muted)" }}>Name</label>
              <input autoFocus type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()} className="flex-1 text-[13px]" style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", outline: "none" }} />
            </div>
            <div className="flex gap-6 mb-6" style={{ alignItems: "center" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 80, letterSpacing: "0.06em", color: "var(--text-muted)" }}>Type</label>
              <select value={editType} onChange={(e) => setEditType(e.target.value)} className="flex-1 text-[13px]" style={{ appearance: "none", padding: "7px 28px 7px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", outline: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.3)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
                {enabledModes.map((t) => (
                  <option key={t} value={t} style={{ background: "var(--surface-2)" }}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEditModal(false)} className="text-xs font-medium" style={{ height: 28, padding: "0 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={!editName.trim() || saving} className="text-xs font-semibold text-white whitespace-nowrap" style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6, opacity: !editName.trim() || saving ? 0.35 : 1, cursor: !editName.trim() || saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
