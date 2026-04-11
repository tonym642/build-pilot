"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { chunkText, ensureChunks, countWords, type LibraryChunk, type AnalysisStatus } from "@/lib/chunking";

/* ─── Types ────────────────────────────────────────────────── */

type WsAiMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  is_favorite: boolean;
  is_liked: boolean;
  is_disliked: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
  created_at: Date;
};

function newWsMsg(id: number, role: "user" | "ai", text: string): WsAiMessage {
  return { id, role, text, is_favorite: false, is_liked: false, is_disliked: false, is_hidden: false, is_deleted: false, created_at: new Date() };
}

type WsFilter = "brainstorm" | "favorites" | "liked" | "hidden" | "trash";
const WS_FILTERS: { key: WsFilter; label: string }[] = [
  { key: "brainstorm", label: "Brainstorm" },
  { key: "favorites", label: "Favorites" },
  { key: "liked", label: "Liked" },
  { key: "hidden", label: "Hidden" },
  { key: "trash", label: "Trash" },
];

type SuggFilter = "all" | "liked" | "disliked" | "hidden" | "trash";
const SUGG_FILTERS: { key: SuggFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "liked", label: "Liked" },
  { key: "disliked", label: "Disliked" },
  { key: "hidden", label: "Hidden" },
  { key: "trash", label: "Trash" },
];

export type WorkspaceNote = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

export type LibrarySuggestion = {
  id: number;
  chunk_id?: string;
  chapter_fit: string;
  section_fit?: string;
  explanation: string;
  excerpt?: string;
  is_liked: boolean;
  is_disliked: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
};

export type { LibraryChunk } from "@/lib/chunking";

export type LibraryItem = {
  id: string;
  title: string;
  source_type: "upload" | "paste";
  file_type?: string;
  content: string;
  chunks: LibraryChunk[];
  word_count?: number;
  analysis_status: AnalysisStatus;
  created_at: string;
  updated_at?: string;
  suggestions: LibrarySuggestion[];
  /** @deprecated Use analysis_status instead. Kept for backward compat. */
  analyzed?: boolean;
};

export type CompiledTopic = {
  title: string;
  subtopic?: string;
  core_idea: string;
  best_insight: string;
  merged_version: string;
  duplicate_count?: number;
  source_chunk_ids?: string[];
};

export type CompiledDraft = {
  id: string;
  title: string;
  source_ids: string[];
  source_chunk_ids?: string[];
  topics: CompiledTopic[];
  status?: "building" | "ready" | "error";
  created_at: string;
  updated_at?: string;
};

export type WorkspaceData = {
  notes: WorkspaceNote[];
  libraryItems: LibraryItem[];
  compiledDrafts: CompiledDraft[];
};

export const EMPTY_WORKSPACE: WorkspaceData = {
  notes: [],
  libraryItems: [],
  compiledDrafts: [],
};

type WsSelection =
  | { type: "none" }
  | { type: "note"; noteId: string }
  | { type: "library"; itemId: string }
  | { type: "compiled_draft"; draftId: string };

/* ─── Filter helpers ───────────────────────────────────────── */

function filterWsMessages(msgs: WsAiMessage[], f: WsFilter): WsAiMessage[] {
  switch (f) {
    case "brainstorm": return msgs.filter((m) => !m.is_hidden && !m.is_deleted);
    case "favorites": return msgs.filter((m) => m.is_favorite && !m.is_deleted);
    case "liked": return msgs.filter((m) => m.is_liked && !m.is_deleted);
    case "hidden": return msgs.filter((m) => m.is_hidden && !m.is_deleted);
    case "trash": return msgs.filter((m) => m.is_deleted);
    default: return msgs;
  }
}

function filterSuggestions(suggs: LibrarySuggestion[], f: SuggFilter): LibrarySuggestion[] {
  switch (f) {
    case "all": return suggs.filter((s) => !s.is_hidden && !s.is_deleted);
    case "liked": return suggs.filter((s) => s.is_liked && !s.is_deleted);
    case "disliked": return suggs.filter((s) => s.is_disliked && !s.is_deleted);
    case "hidden": return suggs.filter((s) => s.is_hidden && !s.is_deleted);
    case "trash": return suggs.filter((s) => s.is_deleted);
    default: return suggs;
  }
}

/* ─── AI Action Bar ────────────────────────────────────────── */

function WsActionBar({ message, onUpdate }: { message: WsAiMessage; onUpdate: (u: WsAiMessage) => void }) {
  function toggle(field: "is_favorite" | "is_liked" | "is_disliked" | "is_hidden" | "is_deleted") {
    const u = { ...message, [field]: !message[field] };
    if (field === "is_liked" && u.is_liked) u.is_disliked = false;
    if (field === "is_disliked" && u.is_disliked) u.is_liked = false;
    onUpdate(u);
  }
  const ic = "var(--text-faint)";
  const ac = "var(--text-primary)";
  const btn = "transition-colors";
  return (
    <div className="mt-2 flex items-center gap-3">
      <button title="Copy" className={btn} style={{ color: ic }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")} onMouseLeave={(e) => (e.currentTarget.style.color = ic)} onClick={() => navigator.clipboard.writeText(message.text)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      <button title={message.is_favorite ? "Unfavorite" : "Favorite"} className={btn} style={{ color: message.is_favorite ? "#fbbf24" : ic }} onMouseEnter={(e) => { if (!message.is_favorite) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_favorite) e.currentTarget.style.color = message.is_favorite ? "#fbbf24" : ic; }} onClick={() => toggle("is_favorite")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      </button>
      <button title={message.is_liked ? "Unlike" : "Like"} className={btn} style={{ color: message.is_liked ? ac : ic }} onMouseEnter={(e) => { if (!message.is_liked) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_liked) e.currentTarget.style.color = message.is_liked ? ac : ic; }} onClick={() => toggle("is_liked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
      </button>
      <button title={message.is_disliked ? "Undo dislike" : "Dislike"} className={btn} style={{ color: message.is_disliked ? ac : ic }} onMouseEnter={(e) => { if (!message.is_disliked) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_disliked) e.currentTarget.style.color = message.is_disliked ? ac : ic; }} onClick={() => toggle("is_disliked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
      </button>
      <button title={message.is_hidden ? "Unhide" : "Hide"} className={btn} style={{ color: message.is_hidden ? ac : ic }} onMouseEnter={(e) => { if (!message.is_hidden) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_hidden) e.currentTarget.style.color = message.is_hidden ? ac : ic; }} onClick={() => toggle("is_hidden")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      </button>
      <button title={message.is_deleted ? "Restore" : "Delete"} className={btn} style={{ color: message.is_deleted ? "#ef4444" : ic }} onMouseEnter={(e) => { if (!message.is_deleted) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_deleted) e.currentTarget.style.color = message.is_deleted ? "#ef4444" : ic; }} onClick={() => toggle("is_deleted")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
      <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>
        {message.created_at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ─── AI Panel (for Notes + Compiled Drafts) ───────────────── */

function WsAiPanel({
  messages, onUpdateMessage, onAddMessage, projectId, bookTitle, context,
}: {
  messages: WsAiMessage[]; onUpdateMessage: (u: WsAiMessage) => void; onAddMessage: (m: WsAiMessage) => void; projectId: string; bookTitle: string; context: string;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<WsFilter>("brainstorm");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    const trimmed = input.trim();
    onAddMessage(newWsMsg(Date.now(), "user", trimmed));
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/brainstorm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: trimmed, chapter: context, bookTitle, project_id: projectId }) });
      const data = await res.json();
      onAddMessage(newWsMsg(Date.now() + 1, "ai", res.ok && data.reply ? data.reply : "I couldn't generate a response right now. Please try again."));
    } catch { onAddMessage(newWsMsg(Date.now() + 1, "ai", "I couldn't generate a response right now. Please try again.")); }
    finally { setLoading(false); }
  }

  const filtered = filterWsMessages(messages, activeFilter);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center px-4 pt-3 pb-2 border-b border-[var(--border-default)]" style={{ height: 46 }}>
        <span className="text-[12px] font-medium shrink-0 mr-auto" style={{ color: "var(--text-faint)" }}>AI Assistant</span>
        <div className="flex items-center gap-1" style={{ overflowX: "auto" }}>
          {WS_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${activeFilter === f.key ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-5 pb-4">
          {filtered.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end"><p className="max-w-[85%] rounded-lg bg-[var(--overlay-active)] px-4 py-2.5 text-[13px] text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p></div>
              ) : (
                <div><p className="text-[13px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p><WsActionBar message={msg} onUpdate={onUpdateMessage} /></div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-[12px] text-[var(--text-faint)] text-center py-8">{activeFilter === "brainstorm" ? "Start a conversation with your AI assistant." : `No ${activeFilter} messages.`}</p>}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0" style={{ padding: "8px 14px 10px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
        <div className="flex items-center gap-2 transition-colors focus-within:border-[rgba(90,154,245,0.3)]" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 20, padding: "3px 8px 3px 12px" }}>
          <span style={{ color: "var(--text-faint)", fontSize: 16, flexShrink: 0, lineHeight: 1 }}>+</span>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }} placeholder="Add an idea, ask a question, or give direction..." className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-faint)]" style={{ padding: "5px 0", fontFamily: "inherit" }} />
          {loading ? (
            <div className="flex items-center justify-center" style={{ width: 24, height: 24, flexShrink: 0 }}>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-tertiary)]" />
            </div>
          ) : (
            <button type="button" aria-label="Send" onClick={handleSubmit} disabled={!input.trim()} className="flex items-center justify-center transition-colors" style={{ width: 24, height: 24, borderRadius: "50%", border: "none", flexShrink: 0, cursor: input.trim() ? "pointer" : "default", fontSize: 12, background: input.trim() ? "#fff" : "transparent", color: input.trim() ? "var(--surface-1)" : "var(--text-faint)" }}>↑</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Suggestion Action Bar (Library) ──────────────────────── */

function SuggActionBar({ sugg, onUpdate }: { sugg: LibrarySuggestion; onUpdate: (u: LibrarySuggestion) => void }) {
  function toggle(field: "is_liked" | "is_disliked" | "is_hidden" | "is_deleted") {
    const u = { ...sugg, [field]: !sugg[field] };
    if (field === "is_liked" && u.is_liked) u.is_disliked = false;
    if (field === "is_disliked" && u.is_disliked) u.is_liked = false;
    onUpdate(u);
  }
  const ic = "var(--text-faint)";
  const ac = "var(--text-primary)";
  const btn = "transition-colors";
  return (
    <div className="mt-2 flex items-center gap-3">
      <button title="Copy" className={btn} style={{ color: ic }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")} onMouseLeave={(e) => (e.currentTarget.style.color = ic)} onClick={() => navigator.clipboard.writeText(`${sugg.chapter_fit}${sugg.section_fit ? " — " + sugg.section_fit : ""}\n${sugg.explanation}${sugg.excerpt ? "\n\n" + sugg.excerpt : ""}`)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      <button title={sugg.is_liked ? "Unlike" : "Like"} className={btn} style={{ color: sugg.is_liked ? ac : ic }} onMouseEnter={(e) => { if (!sugg.is_liked) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!sugg.is_liked) e.currentTarget.style.color = sugg.is_liked ? ac : ic; }} onClick={() => toggle("is_liked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={sugg.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
      </button>
      <button title={sugg.is_disliked ? "Undo dislike" : "Dislike"} className={btn} style={{ color: sugg.is_disliked ? ac : ic }} onMouseEnter={(e) => { if (!sugg.is_disliked) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!sugg.is_disliked) e.currentTarget.style.color = sugg.is_disliked ? ac : ic; }} onClick={() => toggle("is_disliked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={sugg.is_disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
      </button>
      <button title={sugg.is_hidden ? "Unhide" : "Hide"} className={btn} style={{ color: sugg.is_hidden ? ac : ic }} onMouseEnter={(e) => { if (!sugg.is_hidden) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!sugg.is_hidden) e.currentTarget.style.color = sugg.is_hidden ? ac : ic; }} onClick={() => toggle("is_hidden")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      </button>
      <button title={sugg.is_deleted ? "Restore" : "Delete"} className={btn} style={{ color: sugg.is_deleted ? "#ef4444" : ic }} onMouseEnter={(e) => { if (!sugg.is_deleted) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!sugg.is_deleted) e.currentTarget.style.color = sugg.is_deleted ? "#ef4444" : ic; }} onClick={() => toggle("is_deleted")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>
  );
}

/* ─── Notes View (split layout) ────────────────────────────── */

function NotesView({
  note, onContentChange, aiMessages, onUpdateAiMessage, onAddAiMessage, projectId, bookTitle,
}: {
  note: WorkspaceNote; onContentChange: (html: string) => void; aiMessages: WsAiMessage[]; onUpdateAiMessage: (u: WsAiMessage) => void; onAddAiMessage: (m: WsAiMessage) => void; projectId: string; bookTitle: string;
}) {
  const [aiOpen, setAiOpen] = useState(true);
  const [divX, setDivX] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    function move(ev: MouseEvent) { if (!dragging.current || !containerRef.current) return; const r = containerRef.current.getBoundingClientRect(); setDivX(Math.max(25, Math.min(75, ((ev.clientX - r.left) / r.width) * 100))); }
    function up() { dragging.current = false; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="flex flex-col min-h-0" style={{ width: aiOpen ? `${divX}%` : "100%" }}>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <RichTextEditor content={note.content} onChange={onContentChange} label={note.title} placeholder="Write freely — this is your thinking space…" />
        </div>
      </div>
      {aiOpen && (
        <div className="shrink-0 flex items-center justify-center" style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }} onMouseDown={handleMouseDown}>
          <button onClick={() => setAiOpen(false)} title="Close AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="3,1 7,5 3,9" /></svg>
          </button>
        </div>
      )}
      {!aiOpen && (
        <div className="shrink-0 flex items-center" style={{ position: "relative", width: 16 }}>
          <button onClick={() => setAiOpen(true)} title="Open AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, right: -11, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="7,1 3,5 7,9" /></svg>
          </button>
        </div>
      )}
      {aiOpen && (
        <div className="min-h-0 flex flex-col pr-6 pb-6" style={{ width: `${100 - divX}%` }}>
          <div className="flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
            <WsAiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} onAddMessage={onAddAiMessage} projectId={projectId} bookTitle={bookTitle} context={`Workspace Note: ${note.title}`} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Library View (split layout) ──────────────────────────── */

function LibraryView({
  item, onUpdateItem, projectId, bookTitle, chapters,
}: {
  item: LibraryItem; onUpdateItem: (updated: LibraryItem) => void; projectId: string; bookTitle: string; chapters: { title: string; sections: { title: string }[] }[];
}) {
  const [activeFilter, setActiveFilter] = useState<SuggFilter>("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [activeChunkIdx, setActiveChunkIdx] = useState(0);
  const [suggView, setSuggView] = useState<"chunk" | "all">("chunk");
  const [suggLimit, setSuggLimit] = useState(20);
  const analyzingRef = useRef(false); // debounce guard

  // Memoize chunks (backward compat + avoid re-chunking on every render)
  const chunks = useMemo(() => ensureChunks(item.content, item.chunks), [item.content, item.chunks]);
  const activeChunk = chunks[activeChunkIdx] ?? chunks[0];
  const hasMultipleChunks = chunks.length > 1;
  const totalWords = useMemo(() => item.word_count ?? chunks.reduce((s, c) => s + c.word_count, 0), [item.word_count, chunks]);

  // Memoize analyzed chunk IDs set
  const analyzedChunkIds = useMemo(() => new Set(item.suggestions.map((s) => s.chunk_id).filter(Boolean)), [item.suggestions]);
  const activeChunkAnalyzed = activeChunk ? analyzedChunkIds.has(activeChunk.chunk_id) : false;

  // Reset suggestion limit when switching chunks or filters
  useEffect(() => { setSuggLimit(20); }, [activeChunkIdx, suggView, activeFilter]);

  /** Analyze all chunks sequentially, 1-3 suggestions per chunk */
  async function handleAnalyzeAll() {
    if (analyzingRef.current) return; // debounce
    analyzingRef.current = true;
    setAnalyzing(true);
    let allNew: LibrarySuggestion[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        if (analyzedChunkIds.has(c.chunk_id)) continue;
        setAnalyzeProgress(`Chunk ${i + 1} of ${chunks.length}`);
        try {
          const res = await fetch("/api/workspace/analyze-library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: c.chunk_text, chunk_id: c.chunk_id, bookTitle, chapters, project_id: projectId, max_suggestions: 3 }),
          });
          const data = await res.json();
          if (res.ok && Array.isArray(data.suggestions)) {
            allNew = [...allNew, ...data.suggestions];
          }
        } catch { /* skip failed chunk, continue */ }
      }
      onUpdateItem({ ...item, suggestions: [...item.suggestions, ...allNew], analysis_status: "analyzed" as AnalysisStatus });
    } catch { /* silent */ }
    finally { setAnalyzing(false); setAnalyzeProgress(""); analyzingRef.current = false; }
  }

  /** Analyze only the active chunk */
  async function handleAnalyzeChunk() {
    if (!activeChunk || analyzingRef.current) return;
    analyzingRef.current = true;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/workspace/analyze-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: activeChunk.chunk_text, chunk_id: activeChunk.chunk_id, bookTitle, chapters, project_id: projectId, max_suggestions: 3 }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.suggestions)) {
        onUpdateItem({ ...item, suggestions: [...item.suggestions, ...data.suggestions], analysis_status: "analyzed" as AnalysisStatus });
      }
    } catch { /* silent */ }
    finally { setAnalyzing(false); analyzingRef.current = false; }
  }

  const handleUpdateSugg = useCallback((updated: LibrarySuggestion) => {
    onUpdateItem({ ...item, suggestions: item.suggestions.map((s) => s.id === updated.id ? updated : s) });
  }, [item, onUpdateItem]);

  // Memoize chunk lookup for suggestion labels
  const chunkLookup = useMemo(() => new Map(chunks.map((c, i) => [c.chunk_id, { idx: i + 1, title: c.chunk_title }])), [chunks]);

  // Memoize filtered suggestions (client-side, no re-query)
  const filtered = useMemo(() => {
    const viewFiltered = suggView === "chunk" && activeChunk
      ? item.suggestions.filter((s) => s.chunk_id === activeChunk.chunk_id)
      : item.suggestions;
    return filterSuggestions(viewFiltered, activeFilter);
  }, [item.suggestions, suggView, activeChunk, activeFilter]);

  // Paginate: only render up to suggLimit
  const visibleSuggestions = filtered.slice(0, suggLimit);
  const hasMoreSuggestions = filtered.length > suggLimit;

  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-scroll preview to top on chunk change
  useEffect(() => { previewRef.current?.scrollTo({ top: 0 }); }, [activeChunkIdx]);

  function goNext() { if (activeChunkIdx < chunks.length - 1) setActiveChunkIdx(activeChunkIdx + 1); }
  function goPrev() { if (activeChunkIdx > 0) setActiveChunkIdx(activeChunkIdx - 1); }

  return (
    <div className="flex h-full min-h-0 gap-4 p-6">
      {/* Left: preview */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
        {/* Header */}
        <div className="shrink-0 flex items-center px-5 pt-3 pb-2" style={{ height: 46, borderBottom: "1px solid var(--border-default)" }}>
          <span className="text-[12px] font-medium" style={{ color: "var(--text-faint)" }}>Library</span>
          <div className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            <span>{item.source_type === "upload" ? (item.file_type ?? "File").toUpperCase() : "Pasted Text"}</span>
            <span>&middot;</span>
            <span>{totalWords.toLocaleString()}w</span>
            {hasMultipleChunks && <><span>&middot;</span><span>{chunks.length} chunks</span></>}
            <span>&middot;</span>
            <span style={{ color: item.analysis_status === "analyzed" ? "var(--accent-green)" : item.analysis_status === "chunked" ? "var(--accent-blue)" : "var(--text-faint)" }}>{item.analysis_status === "analyzed" ? "Analyzed" : item.analysis_status === "chunked" ? "Chunked" : item.analysis_status === "error" ? "Error" : "Not analyzed"}</span>
          </div>
        </div>

        {/* Title + chunk selector */}
        <div className="shrink-0 px-5 pt-4 pb-2">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</h2>
          {hasMultipleChunks && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={activeChunkIdx}
                onChange={(e) => setActiveChunkIdx(Number(e.target.value))}
                className="rounded border border-[var(--border-default)] bg-[var(--surface-3)] px-2 py-1 text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer"
                style={{ maxWidth: 260 }}
              >
                {chunks.map((c, i) => (
                  <option key={c.chunk_id} value={i}>{c.chunk_title} ({c.word_count}w)</option>
                ))}
              </select>
              <div className="flex items-center gap-0.5">
                <button onClick={goPrev} disabled={activeChunkIdx === 0} className="flex items-center justify-center rounded transition-colors disabled:opacity-20 hover:bg-[var(--overlay-hover)]" style={{ width: 20, height: 20, color: "var(--text-faint)" }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="6,1 2,5 6,9" /></svg>
                </button>
                <button onClick={goNext} disabled={activeChunkIdx === chunks.length - 1} className="flex items-center justify-center rounded transition-colors disabled:opacity-20 hover:bg-[var(--overlay-hover)]" style={{ width: 20, height: 20, color: "var(--text-faint)" }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="4,1 8,5 4,9" /></svg>
                </button>
              </div>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{activeChunkIdx + 1}/{chunks.length}</span>
            </div>
          )}
        </div>

        {/* Content preview */}
        <div ref={previewRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3">
          {activeChunk && (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
              {activeChunk.chunk_text}
            </div>
          )}
          {!activeChunk && (
            <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No content available.</p>
          )}
        </div>
      </div>

      {/* Right: suggestions */}
      <div className="shrink-0 flex flex-col min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]" style={{ width: "42%" }}>
        {/* Header: title + view toggle + analyze + filters — all in one row */}
        <div className="shrink-0 flex items-center gap-1 px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--border-default)", overflowX: "auto" }}>
          <span className="text-[12px] font-medium shrink-0 mr-1" style={{ color: "var(--text-faint)" }}>Suggestions</span>
          {/* View toggle */}
          {hasMultipleChunks && (
            <>
              <div className="flex items-center gap-0.5 shrink-0 rounded" style={{ background: "var(--overlay-hover)", padding: "1px" }}>
                <button onClick={() => setSuggView("chunk")} className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${suggView === "chunk" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>Chunk</button>
                <button onClick={() => setSuggView("all")} className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${suggView === "all" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>All</button>
              </div>
              <div className="shrink-0" style={{ width: 1, height: 14, background: "var(--border-default)" }} />
            </>
          )}
          {/* Analyze pill */}
          <button
            onClick={() => { if (suggView === "chunk" && !activeChunkAnalyzed) handleAnalyzeChunk(); else handleAnalyzeAll(); }}
            disabled={analyzing}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors flex items-center gap-1 disabled:opacity-40 ${item.suggestions.length > 0 ? "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]" : "text-[var(--accent-purple)]"}`}
            style={{ border: "1px solid var(--border-hover)", background: item.suggestions.length === 0 ? "rgba(139,124,245,0.08)" : "transparent" }}
          >
            {analyzing ? (
              <><div className="h-2.5 w-2.5 animate-spin rounded-full border border-[var(--border-default)] border-t-[var(--accent-purple)]" /><span>{analyzeProgress || "..."}</span></>
            ) : item.suggestions.length > 0 ? (
              <span>Reanalyze</span>
            ) : (
              <span>Analyze</span>
            )}
          </button>
          {hasMultipleChunks && !analyzing && (
            <span className="shrink-0 text-[9px]" style={{ color: "var(--text-faint)" }}>{analyzedChunkIds.size}/{chunks.length}</span>
          )}
          <div className="shrink-0" style={{ width: 1, height: 14, background: "var(--border-default)" }} />
          {/* Status filters */}
          {SUGG_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors whitespace-nowrap ${activeFilter === f.key ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {/* Empty: no suggestions at all */}
          {item.suggestions.length === 0 && !analyzing && (
            <p className="text-[12px] text-[var(--text-faint)] text-center py-8">Analyze this document to generate suggestions.</p>
          )}
          {/* Analyzing progress */}
          {analyzing && filtered.length === 0 && (
            <p className="text-[12px] text-[var(--text-faint)] text-center py-8">Generating suggestions...</p>
          )}
          {/* Current chunk not analyzed (chunk view) */}
          {!analyzing && suggView === "chunk" && !activeChunkAnalyzed && item.suggestions.length > 0 && (
            <p className="text-[12px] text-[var(--text-faint)] text-center py-8">No suggestions for this chunk yet. Click Reanalyze to generate.</p>
          )}
          {/* Filtered empty */}
          {!analyzing && filtered.length === 0 && (suggView === "all" || activeChunkAnalyzed) && item.suggestions.length > 0 && (
            <p className="text-[12px] text-[var(--text-faint)] text-center py-8">{activeFilter === "all" ? "No suggestions." : `No ${activeFilter} suggestions.`}</p>
          )}
          {/* Suggestion cards (paginated) */}
          <div className="flex flex-col gap-4">
            {visibleSuggestions.map((s) => {
              const cl = s.chunk_id ? chunkLookup.get(s.chunk_id) : null;
              return (
                <div key={s.id} className="rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] p-4">
                  {/* Chunk context label */}
                  {cl && suggView === "all" && (
                    <div className="mb-2 flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      <span>Chunk {cl.idx}</span>
                      <span>&middot;</span>
                      <span>{cl.title}</span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{s.chapter_fit}</span>
                    {s.section_fit && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.section_fit}</span>}
                  </div>
                  <p className="text-[12px] leading-relaxed mb-1" style={{ color: "var(--text-secondary)" }}>{s.explanation}</p>
                  {s.excerpt && (
                    <div className="mt-2 rounded border-l-2 pl-3 py-1" style={{ borderColor: "var(--accent-purple)" }}>
                      <p className="text-[12px] italic" style={{ color: "var(--text-tertiary)" }}>&ldquo;{s.excerpt}&rdquo;</p>
                    </div>
                  )}
                  <SuggActionBar sugg={s} onUpdate={handleUpdateSugg} />
                </div>
              );
            })}
            {hasMoreSuggestions && (
              <button onClick={() => setSuggLimit((v) => v + 20)} className="text-[12px] font-medium py-2 transition-colors" style={{ color: "var(--text-faint)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-faint)")}>
                Show more ({filtered.length - suggLimit} remaining)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Compiled Draft View (split layout) ───────────────────── */

function CompiledDraftView({
  draft, sourceItems, onUpdateDraft, aiMessages, onUpdateAiMessage, onAddAiMessage, projectId, bookTitle,
}: {
  draft: CompiledDraft; sourceItems: LibraryItem[]; onUpdateDraft: (updated: CompiledDraft) => void; aiMessages: WsAiMessage[]; onUpdateAiMessage: (u: WsAiMessage) => void; onAddAiMessage: (m: WsAiMessage) => void; projectId: string; bookTitle: string;
}) {
  const [aiOpen, setAiOpen] = useState(true);
  const [divX, setDivX] = useState(50);
  const [rebuilding, setRebuilding] = useState(false);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    function move(ev: MouseEvent) { if (!dragging.current || !containerRef.current) return; const r = containerRef.current.getBoundingClientRect(); setDivX(Math.max(25, Math.min(75, ((ev.clientX - r.left) / r.width) * 100))); }
    function up() { dragging.current = false; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      const chunkPayload = sourceItems.flatMap((it) => {
        const chunks = ensureChunks(it.content, it.chunks);
        return chunks.map((c) => ({ chunk_id: c.chunk_id, item_title: it.title, chunk_title: c.chunk_title, chunk_text: c.chunk_text }));
      });
      const res = await fetch("/api/workspace/compile-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks: chunkPayload, bookTitle, project_id: projectId }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.topics)) {
        onUpdateDraft({ ...draft, topics: data.topics, status: "ready", updated_at: new Date().toISOString() });
      }
    } catch { /* silent */ }
    finally { setRebuilding(false); }
  }

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(draft.title);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 p-6 gap-4">
      {/* Left: compiled content */}
      <div className="flex flex-col min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]" style={{ width: aiOpen ? `${divX}%` : "100%" }}>
        {/* Header label */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2" style={{ height: 46, borderBottom: "1px solid var(--border-default)" }}>
          <span className="text-[12px] font-medium" style={{ color: "var(--text-faint)" }}>Compiled Draft</span>
          <div className="flex items-center gap-2">
            <button onClick={() => { setTitleDraft(draft.title); setEditingTitle(true); }} className="text-[11px] font-medium px-2 py-0.5 rounded transition-colors" style={{ color: "var(--text-muted)", border: "1px solid var(--border-default)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>Rename</button>
            <button onClick={handleRebuild} disabled={rebuilding} className="text-[11px] font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-40" style={{ color: "var(--text-muted)", border: "1px solid var(--border-default)" }} onMouseEnter={(e) => { if (!rebuilding) e.currentTarget.style.color = "var(--text-secondary)"; }} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>{rebuilding ? "Rebuilding..." : "Rebuild"}</button>
          </div>
        </div>

        {/* Title + metadata */}
        <div className="px-5 pt-4 pb-2">
          {editingTitle ? (
            <input type="text" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={() => { onUpdateDraft({ ...draft, title: titleDraft }); setEditingTitle(false); }} onKeyDown={(e) => { if (e.key === "Enter") { onUpdateDraft({ ...draft, title: titleDraft }); setEditingTitle(false); } if (e.key === "Escape") setEditingTitle(false); }} autoFocus className="text-[16px] font-semibold bg-transparent border-none outline-none w-full" style={{ color: "var(--text-primary)", padding: 0 }} />
          ) : (
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>{draft.title}</h2>
          )}
          <div className="mt-1 flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>{sourceItems.length} source file{sourceItems.length !== 1 ? "s" : ""}</span>
            <span>Created {new Date(draft.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            {draft.topics.length > 0 && <span>{draft.topics.length} topic{draft.topics.length !== 1 ? "s" : ""} merged</span>}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3">
          {/* Sources used */}
          {sourceItems.length > 0 && (
            <div className="mb-5 rounded-md border border-[var(--border-subtle)] p-4" style={{ background: "var(--overlay-hover)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Sources Used</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {sourceItems.map((si) => (
                  <span key={si.id} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--overlay-active)", color: "var(--text-tertiary)" }}>{si.title}</span>
                ))}
              </div>
            </div>
          )}

          {/* Building state */}
          {draft.topics.length === 0 && rebuilding && (
            <div className="text-center py-10">
              <div className="inline-flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-purple)]" />
                <p className="text-[13px] text-[var(--text-tertiary)]">AI is analyzing and organizing your sources...</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {draft.topics.length === 0 && !rebuilding && (
            <div className="text-center py-10">
              <p className="text-[13px] text-[var(--text-faint)] mb-1">No compiled content yet.</p>
              <p className="text-[12px] text-[var(--text-faint)] mb-4">Click Build Now to have AI organize your source material into topics.</p>
              <button onClick={handleRebuild} disabled={rebuilding} className="text-[13px] font-medium transition-all disabled:opacity-40" style={{ height: 34, padding: "0 18px", borderRadius: 20, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}>
                Build Now
              </button>
            </div>
          )}

          {/* Topic cards */}
          <div className="flex flex-col gap-4">
            {draft.topics.map((topic, i) => (
              <div key={i} className="rounded-md border border-[var(--border-subtle)] p-5" style={{ background: "var(--overlay-hover)" }}>
                <div className="flex items-baseline gap-2 mb-1">
                  <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{topic.title}</h3>
                  {topic.subtopic && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{topic.subtopic}</span>}
                </div>
                {(topic.duplicate_count ?? 0) > 1 && (
                  <p className="text-[10px] mb-3" style={{ color: "var(--text-faint)" }}>{topic.duplicate_count} similar passages merged</p>
                )}
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Core Idea</span>
                    <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{topic.core_idea}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Best Extracted Insight</span>
                    <p className="mt-1 text-[13px] leading-relaxed italic" style={{ color: "var(--text-tertiary)" }}>&ldquo;{topic.best_insight}&rdquo;</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Merged Version</span>
                    <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{topic.merged_version}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      {aiOpen && (
        <div className="shrink-0 flex items-center justify-center" style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }} onMouseDown={handleMouseDown}>
          <button onClick={() => setAiOpen(false)} title="Close AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="3,1 7,5 3,9" /></svg>
          </button>
        </div>
      )}
      {!aiOpen && (
        <div className="shrink-0 flex items-center" style={{ position: "relative", width: 16 }}>
          <button onClick={() => setAiOpen(true)} title="Open AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, right: -11, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="7,1 3,5 7,9" /></svg>
          </button>
        </div>
      )}

      {/* Right: AI assistant */}
      {aiOpen && (
        <div className="min-h-0 flex flex-col" style={{ width: `${100 - divX}%` }}>
          <div className="flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
            <WsAiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} onAddMessage={onAddAiMessage} projectId={projectId} bookTitle={bookTitle} context={`Compiled Draft: ${draft.title}`} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Import Modal ─────────────────────────────────────────── */

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (item: LibraryItem) => void }) {
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function buildItem(title: string, sourceType: "upload" | "paste", fileType: string | undefined, content: string): LibraryItem {
    const ch = chunkText(content);
    return { id: crypto.randomUUID(), title, source_type: sourceType, file_type: fileType, content, chunks: ch, word_count: ch.reduce((s, c) => s + c.word_count, 0), created_at: new Date().toISOString(), suggestions: [], analysis_status: "chunked" as AnalysisStatus };
  }

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    setUploadError(null);

    if (ext === "docx") {
      // Parse DOCX server-side with mammoth
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/workspace/parse-docx", { method: "POST", body: form });
        const data = await res.json();
        if (res.ok && data.text) {
          onImport(buildItem(file.name, "upload", ext, data.text));
        } else {
          setUploadError(data.error || "Could not extract readable text from this DOCX file.");
        }
      } catch {
        setUploadError("Could not extract readable text from this DOCX file.");
      } finally { setUploading(false); }
    } else if (ext === "txt" || ext === "md") {
      // Read plain text directly
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === "string" ? reader.result : "";
        onImport(buildItem(file.name, "upload", ext, content));
      };
      reader.readAsText(file);
    } else {
      // PDF and other formats — read as text (best effort)
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === "string" ? reader.result : "";
        if (!content.trim() || content.includes("\x00")) {
          setUploadError("Could not extract readable text from this file. Try pasting the text instead.");
          return;
        }
        onImport(buildItem(file.name, "upload", ext, content));
      };
      reader.readAsText(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handlePasteSave() {
    if (!pasteContent.trim()) return;
    onImport(buildItem(pasteTitle.trim() || "Untitled", "paste", undefined, pasteContent));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Add to Library</h2>
        <div className="mt-4 flex gap-1 mb-4">
          <button onClick={() => setTab("upload")} className={`px-3 py-1.5 text-[13px] rounded transition-colors ${tab === "upload" ? "bg-[var(--overlay-active)] font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`}>Upload File</button>
          <button onClick={() => setTab("paste")} className={`px-3 py-1.5 text-[13px] rounded transition-colors ${tab === "paste" ? "bg-[var(--overlay-active)] font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`}>Paste Text</button>
        </div>

        {tab === "upload" && (
          <>
            <div
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${dragOver ? "border-[var(--accent-blue)] bg-[rgba(90,154,245,0.06)]" : "border-[var(--border-default)]"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-blue)]" />
                  <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Extracting text from DOCX...</p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] mb-3" style={{ color: "var(--text-tertiary)" }}>Drop a file here or</p>
                  <button onClick={() => fileRef.current?.click()} className="text-[13px] font-medium transition-colors" style={{ color: "var(--accent-blue)" }}>Choose File</button>
                  <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>PDF, DOCX, TXT</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            {uploadError && (
              <p className="mt-3 text-[12px] text-red-400">{uploadError}</p>
            )}
          </>
        )}

        {tab === "paste" && (
          <div className="flex flex-col gap-3">
            <input type="text" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors" />
            <textarea value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} placeholder="Paste your text here..." rows={8} className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors" />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
              <button onClick={handlePasteSave} disabled={!pasteContent.trim()} className="rounded-lg px-4 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-40" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: pasteContent.trim() ? "pointer" : "default" }}>Add to Library</button>
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Create Compiled Draft Modal ──────────────────────────── */

function CreateDraftModal({
  sourceItems, onClose, onCreate,
}: {
  sourceItems: LibraryItem[]; onClose: () => void; onCreate: (name: string) => void;
}) {
  const [name, setName] = useState(`Compiled Draft — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Create Compiled Draft</h2>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>AI will analyze your selected files together, group related ideas by topic, merge duplicates, and produce an organized draft.</p>

        <div className="mt-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Draft Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Draft name" className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onCreate(name.trim()); }} />
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Source Files ({sourceItems.length})</label>
          <div className="mt-2 flex flex-col gap-1">
            {sourceItems.map((si) => (
              <div key={si.id} className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ background: "var(--overlay-active)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-faint)", flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span className="text-[12px] truncate" style={{ color: "var(--text-tertiary)" }}>{si.title}</span>
                <span className="ml-auto text-[10px] shrink-0" style={{ color: "var(--text-faint)" }}>{si.source_type === "upload" ? (si.file_type ?? "file").toUpperCase() : "paste"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
          <button onClick={() => { if (name.trim()) onCreate(name.trim()); }} disabled={!name.trim()} className="rounded-lg px-4 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-40" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: name.trim() ? "pointer" : "default" }}>Create Draft</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Workspace Component ─────────────────────────────── */

export function useWorkspace({
  projectId, bookTitle, data, chapters, onChange,
}: {
  projectId: string;
  bookTitle: string;
  data: WorkspaceData;
  chapters: { title: string; sections: { title: string }[] }[];
  onChange: (data: WorkspaceData) => void;
}) {
  const [selection, setSelection] = useState<WsSelection>({ type: "none" });
  const [selectedLibIds, setSelectedLibIds] = useState<Set<string>>(new Set());
  const [wsAiMessages, setWsAiMessages] = useState<Record<string, WsAiMessage[]>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateDraftModal, setShowCreateDraftModal] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ notes: true, library: true, compiled_drafts: true });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: string; type: "note" | "library" } | null>(null);

  useEffect(() => { setMobileSidebarOpen(false); }, [selection]);

  /* ─── CRUD handlers ─────────────────────────────────────── */

  function addNote() {
    const id = crypto.randomUUID();
    const note: WorkspaceNote = { id, title: "Untitled Note", content: "", created_at: new Date().toISOString() };
    onChange({ ...data, notes: [...data.notes, note] });
    setSelection({ type: "note", noteId: id });
  }

  function updateNote(noteId: string, patch: Partial<WorkspaceNote>) {
    onChange({ ...data, notes: data.notes.map((n) => n.id === noteId ? { ...n, ...patch } : n) });
  }

  function handleLibraryImport(item: LibraryItem) {
    onChange({ ...data, libraryItems: [...data.libraryItems, item] });
    setShowImportModal(false);
    setSelection({ type: "library", itemId: item.id });
  }

  function updateLibraryItem(updated: LibraryItem) {
    onChange({ ...data, libraryItems: data.libraryItems.map((li) => li.id === updated.id ? updated : li) });
  }

  function toggleLibSelect(id: string) {
    setSelectedLibIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCreateDraft(name: string) {
    const id = crypto.randomUUID();
    const sourceIds = Array.from(selectedLibIds);
    const sourceItems = data.libraryItems.filter((li) => sourceIds.includes(li.id));
    // Collect all chunk IDs from selected items
    const allChunkIds: string[] = [];
    for (const si of sourceItems) {
      const chunks = ensureChunks(si.content, si.chunks);
      for (const c of chunks) allChunkIds.push(c.chunk_id);
    }
    const draft: CompiledDraft = {
      id,
      title: name,
      source_ids: sourceIds,
      source_chunk_ids: allChunkIds,
      topics: [],
      status: "building",
      created_at: new Date().toISOString(),
    };
    onChange({ ...data, compiledDrafts: [...data.compiledDrafts, draft] });
    setShowCreateDraftModal(false);
    setSelectedLibIds(new Set());
    setSelection({ type: "compiled_draft", draftId: id });

    // Auto-build: send chunks to AI
    try {
      const chunkPayload = sourceItems.flatMap((it) => {
        const chunks = ensureChunks(it.content, it.chunks);
        return chunks.map((c) => ({ chunk_id: c.chunk_id, item_title: it.title, chunk_title: c.chunk_title, chunk_text: c.chunk_text }));
      });
      const res = await fetch("/api/workspace/compile-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks: chunkPayload, bookTitle, project_id: projectId }),
      });
      const result = await res.json();
      if (res.ok && Array.isArray(result.topics)) {
        onChange({ ...data, compiledDrafts: [...data.compiledDrafts, { ...draft, topics: result.topics, status: "ready" as const, updated_at: new Date().toISOString() }] });
      } else {
        onChange({ ...data, compiledDrafts: [...data.compiledDrafts, { ...draft, status: "error" as const }] });
      }
    } catch {
      onChange({ ...data, compiledDrafts: [...data.compiledDrafts, { ...draft, status: "error" as const }] });
    }
  }

  function updateDraft(updated: CompiledDraft) {
    onChange({ ...data, compiledDrafts: data.compiledDrafts.map((d) => d.id === updated.id ? updated : d) });
  }

  /* ─── AI message handlers ───────────────────────────────── */

  function addAiMsg(key: string, msg: WsAiMessage) {
    setWsAiMessages((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg] }));
  }

  function updateAiMsg(key: string, updated: WsAiMessage) {
    setWsAiMessages((prev) => ({ ...prev, [key]: (prev[key] ?? []).map((m) => m.id === updated.id ? updated : m) }));
  }

  /* ─── Current items ─────────────────────────────────────── */

  const currentNote = selection.type === "note" ? data.notes.find((n) => n.id === selection.noteId) : null;
  const currentLib = selection.type === "library" ? data.libraryItems.find((li) => li.id === selection.itemId) : null;
  const currentDraft = selection.type === "compiled_draft" ? data.compiledDrafts.find((d) => d.id === selection.draftId) : null;
  const currentDraftSources = currentDraft ? data.libraryItems.filter((li) => currentDraft.source_ids.includes(li.id)) : [];

  /* ─── Render ────────────────────────────────────────────── */

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const notesHasActive = selection.type === "note";
  const libraryHasActive = selection.type === "library";
  const draftsHasActive = selection.type === "compiled_draft";

  /* Sidebar content (rendered by parent inside shared sidebar) */
  const sidebarContent = (
    <nav className="flex flex-col gap-0.5 text-[14px] px-4 pt-5 pb-4">

      {/* ── Notes Group ── */}
      <div>
        <div className="group flex items-center">
          <button onClick={() => toggleGroup("notes")} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${expandedGroups.notes ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
          </button>
          <button onClick={() => toggleGroup("notes")} className="flex-1 rounded px-1 py-1.5 text-left min-w-0 transition-colors flex items-baseline">
            <span className="text-[14px] font-medium" style={{ color: notesHasActive ? "var(--text-primary)" : "var(--text-tertiary)" }}>Notes</span>
            {data.notes.length > 0 && <span className="shrink-0 text-[11px] ml-1" style={{ color: "var(--text-faint)" }}>({data.notes.length})</span>}
          </button>
          <button onClick={addNote} title="New note" className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-0.5">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
          </button>
        </div>
        {expandedGroups.notes && (
          <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
            {data.notes.map((n) => {
              const isActive = selection.type === "note" && selection.noteId === n.id;
              const isEditing = editingItemId === n.id;
              return (
                <div key={n.id} className="group/note flex items-center">
                  <button onClick={() => setSelection({ type: "note", noteId: n.id })} className={`flex-1 rounded px-2 py-1 text-left min-w-0 transition-colors ${isActive ? "bg-[var(--overlay-active)]" : ""}`}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={n.title}
                        onChange={(e) => updateNote(n.id, { title: e.target.value })}
                        onBlur={() => setEditingItemId(null)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { setEditingItemId(null); (e.target as HTMLInputElement).blur(); } }}
                        autoFocus
                        className="w-full bg-transparent border-none outline-none text-[13px]"
                        style={{ color: "var(--text-primary)", padding: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="block text-[13px] truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-faint)" }}>{n.title || "Untitled Note"}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setEditingItemId(n.id)}
                    title="Rename"
                    className="shrink-0 opacity-0 group-hover/note:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-1"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId({ id: n.id, type: "note" })}
                    title="Delete note"
                    className="shrink-0 opacity-0 group-hover/note:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all px-1"
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
                  </button>
                </div>
              );
            })}
            {data.notes.length === 0 && (
              <button onClick={addNote} className="px-2 py-1 text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-blue)] transition-colors text-left">+ Add Note</button>
            )}
          </div>
        )}
      </div>

      {/* ── Library Group ── */}
      <div className="mt-2">
        <div className="group flex items-center">
          <button onClick={() => toggleGroup("library")} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${expandedGroups.library ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
          </button>
          <button onClick={() => toggleGroup("library")} className="flex-1 rounded px-1 py-1.5 text-left min-w-0 transition-colors flex items-baseline">
            <span className="text-[14px] font-medium" style={{ color: libraryHasActive ? "var(--text-primary)" : "var(--text-tertiary)" }}>Library</span>
            {data.libraryItems.length > 0 && <span className="shrink-0 text-[11px] ml-1" style={{ color: "var(--text-faint)" }}>({data.libraryItems.length})</span>}
          </button>
          <button onClick={() => setShowImportModal(true)} title="Add to library" className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-0.5">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
          </button>
        </div>
        {expandedGroups.library && (
          <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
            {data.libraryItems.map((li) => {
              const isActive = selection.type === "library" && selection.itemId === li.id;
              const isEditing = editingItemId === li.id;
              return (
                <div key={li.id} className="group/lib flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedLibIds.has(li.id)}
                    onChange={() => toggleLibSelect(li.id)}
                    className="shrink-0 mr-1 accent-[var(--accent-blue)]"
                    style={{ width: 12, height: 12 }}
                  />
                  <button onClick={() => setSelection({ type: "library", itemId: li.id })} className={`flex-1 rounded px-1 py-1 text-left min-w-0 transition-colors ${isActive ? "bg-[var(--overlay-active)]" : ""}`}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={li.title}
                        onChange={(e) => updateLibraryItem({ ...li, title: e.target.value })}
                        onBlur={() => setEditingItemId(null)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { setEditingItemId(null); (e.target as HTMLInputElement).blur(); } }}
                        autoFocus
                        className="w-full bg-transparent border-none outline-none text-[13px]"
                        style={{ color: "var(--text-primary)", padding: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="block text-[13px] truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-faint)" }}>{li.title}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setEditingItemId(li.id)}
                    title="Rename"
                    className="shrink-0 opacity-0 group-hover/lib:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-1"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId({ id: li.id, type: "library" })}
                    title="Delete library item"
                    className="shrink-0 opacity-0 group-hover/lib:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all px-1"
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
                  </button>
                </div>
              );
            })}
            {data.libraryItems.length === 0 && (
              <button onClick={() => setShowImportModal(true)} className="px-2 py-1 text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-blue)] transition-colors text-left">+ Add to Library</button>
            )}
            {selectedLibIds.size > 0 && (
              <button
                onClick={() => { if (selectedLibIds.size >= 2) setShowCreateDraftModal(true); }}
                disabled={selectedLibIds.size < 2}
                className="mt-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white transition-colors disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: selectedLibIds.size >= 2 ? "pointer" : "default" }}
              >
                {selectedLibIds.size < 2 ? `Select ${2 - selectedLibIds.size} more` : `Build Compiled Draft (${selectedLibIds.size})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Compiled Drafts Group ── */}
      <div className="mt-2">
        <div className="group flex items-center">
          <button onClick={() => toggleGroup("compiled_drafts")} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${expandedGroups.compiled_drafts ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
          </button>
          <button onClick={() => toggleGroup("compiled_drafts")} className="flex-1 rounded px-1 py-1.5 text-left min-w-0 transition-colors flex items-baseline">
            <span className="text-[14px] font-medium" style={{ color: draftsHasActive ? "var(--text-primary)" : "var(--text-tertiary)" }}>Compiled Drafts</span>
            {data.compiledDrafts.length > 0 && <span className="shrink-0 text-[11px] ml-1" style={{ color: "var(--text-faint)" }}>({data.compiledDrafts.length})</span>}
          </button>
          <button onClick={() => { if (selectedLibIds.size >= 2) { setShowCreateDraftModal(true); } }} title={selectedLibIds.size >= 2 ? "Create compiled draft" : "Select at least 2 library items"} className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-0.5" style={{ opacity: selectedLibIds.size >= 2 ? undefined : 0.3 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
          </button>
        </div>
        {expandedGroups.compiled_drafts && (
          <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
            {data.compiledDrafts.map((d) => {
              const isActive = selection.type === "compiled_draft" && selection.draftId === d.id;
              const srcCount = d.source_ids.length;
              const created = new Date(d.created_at);
              const isToday = new Date().toDateString() === created.toDateString();
              const dateLabel = isToday ? "today" : created.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <button key={d.id} onClick={() => setSelection({ type: "compiled_draft", draftId: d.id })} className={`w-full rounded px-2 py-1 text-left min-w-0 transition-colors ${isActive ? "bg-[var(--overlay-active)]" : ""}`}>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={d.title}
                      onChange={(e) => updateDraft({ ...d, title: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px]"
                      style={{ color: isActive ? "var(--text-primary)" : "var(--text-faint)", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    />
                    <span className="shrink-0 text-[10px]" style={{ color: "var(--text-faint)" }}>{srcCount}f &middot; {dateLabel}</span>
                  </div>
                </button>
              );
            })}
            {data.compiledDrafts.length === 0 && (
              <p className="px-2 py-1 text-[12px] text-[var(--text-faint)]">No compiled drafts yet</p>
            )}
          </div>
        )}
      </div>
    </nav>
  );

  /* Main content area */
  const mainContent = (
    <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
          {/* Notes view */}
          {currentNote && (
            <NotesView
              note={currentNote}
              onContentChange={(html) => updateNote(currentNote.id, { content: html })}
              aiMessages={wsAiMessages[currentNote.id] ?? []}
              onUpdateAiMessage={(u) => updateAiMsg(currentNote.id, u)}
              onAddAiMessage={(m) => addAiMsg(currentNote.id, m)}
              projectId={projectId}
              bookTitle={bookTitle}
            />
          )}

          {/* Library view */}
          {currentLib && (
            <LibraryView
              item={currentLib}
              onUpdateItem={updateLibraryItem}
              projectId={projectId}
              bookTitle={bookTitle}
              chapters={chapters}
            />
          )}

          {/* Compiled Draft view */}
          {currentDraft && (
            <CompiledDraftView
              draft={currentDraft}
              sourceItems={currentDraftSources}
              onUpdateDraft={updateDraft}
              aiMessages={wsAiMessages[currentDraft.id] ?? []}
              onUpdateAiMessage={(u) => updateAiMsg(currentDraft.id, u)}
              onAddAiMessage={(m) => addAiMsg(currentDraft.id, m)}
              projectId={projectId}
              bookTitle={bookTitle}
            />
          )}

          {/* Empty state */}
          {selection.type === "none" && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[15px] font-medium" style={{ color: "var(--text-tertiary)" }}>Workspace</p>
                <p className="mt-2 text-[13px]" style={{ color: "var(--text-faint)" }}>Create a note, import source material, or build a compiled draft.</p>
              </div>
            </div>
          )}
      </div>

      {/* Modals */}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} onImport={handleLibraryImport} />}
      {showCreateDraftModal && <CreateDraftModal sourceItems={data.libraryItems.filter((li) => selectedLibIds.has(li.id))} onClose={() => setShowCreateDraftModal(false)} onCreate={handleCreateDraft} />}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)}>
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Delete {confirmDeleteId.type === "note" ? "note" : "library item"}?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">This will permanently remove {confirmDeleteId.type === "note" ? "this note and its content" : "this item and its suggestions"}.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
              <button onClick={() => {
                const { id, type } = confirmDeleteId;
                if (type === "note") {
                  onChange({ ...data, notes: data.notes.filter((x) => x.id !== id) });
                  if (selection.type === "note" && selection.noteId === id) setSelection({ type: "none" });
                } else {
                  onChange({ ...data, libraryItems: data.libraryItems.filter((x) => x.id !== id) });
                  selectedLibIds.delete(id);
                  setSelectedLibIds(new Set(selectedLibIds));
                  if (selection.type === "library" && selection.itemId === id) setSelection({ type: "none" });
                }
                setConfirmDeleteId(null);
              }} className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return { sidebarContent, mainContent };
}
