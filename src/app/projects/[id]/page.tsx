"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppMode from "./app-mode";
import { useMainSidebar } from "@/components/layout/sidebar-context";
import { RichTextEditor } from "@/components/editor/rich-text-editor";


const STAGES = ["Compose", "Manuscript", "Publish"] as const;

/** Check if HTML content has any visible text */
function hasContent(html: string): boolean {
  if (!html) return false;
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 0;
}
type Stage = (typeof STAGES)[number];

/* ─── AI message with metadata ──────────────────────────────── */

type AiMessage = {
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

function newAiMessage(id: number, role: "user" | "ai", text: string): AiMessage {
  return { id, role, text, is_favorite: false, is_liked: false, is_disliked: false, is_hidden: false, is_deleted: false, created_at: new Date() };
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

function filterMessages(messages: AiMessage[], filter: AiFilter): AiMessage[] {
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

/* ─── Data model: chapters are containers, sections are writing units ── */

type SectionData = {
  id: string;
  title: string;
};

type ChapterData = {
  id: string;
  title: string;
  sections: SectionData[];
};

/* ─── Selection state: what's active in the sidebar ─────────── */
type ActiveSelection =
  | { type: "book_info" }
  | { type: "prologue" }
  | { type: "epilogue" }
  | { type: "chapter"; chapterId: string }
  | { type: "section"; chapterId: string; sectionId: string };

function selectionKey(sel: ActiveSelection): string {
  if (sel.type === "section") return `section::${sel.sectionId}`;
  if (sel.type === "chapter") return `chapter::${sel.chapterId}`;
  return sel.type;
}

/* ─── BookInfo ──────────────────────────────────────────────── */

type BookInfo = {
  title: string;
  subtitle: string;
  author: string;
  one_line_hook: string;
  summary: string;
  audience: string;
  promise: string;
  tone: string;
  genre: string;
  synopsis: string;
};

const EMPTY_BOOK_INFO: BookInfo = {
  title: "",
  subtitle: "",
  author: "",
  one_line_hook: "",
  summary: "",
  audience: "",
  promise: "",
  tone: "",
  genre: "",
  synopsis: "",
};

/* ─── BookInfoPanel ─────────────────────────────────────────── */

function BookInfoPanel({
  bookInfo,
  onChange,
}: {
  bookInfo: BookInfo;
  onChange: (updated: BookInfo) => void;
}) {
  const fields: { key: keyof BookInfo; label: string; multiline?: boolean; placeholder?: string }[] = [
    { key: "title", label: "Title", placeholder: "e.g. Life Basics 101" },
    { key: "subtitle", label: "Subtitle", placeholder: "e.g. A guide to living intentionally" },
    { key: "author", label: "Author", placeholder: "e.g. Tony Medina" },
    { key: "genre", label: "Genre", placeholder: "e.g. Self-help, Memoir, Fiction" },
    { key: "tone", label: "Tone", placeholder: "e.g. Warm, direct, conversational" },
    { key: "one_line_hook", label: "One-Line Hook", multiline: false, placeholder: "A single sentence that captures the essence of the book" },
    { key: "audience", label: "Audience", multiline: true, placeholder: "Who is this book for?" },
    { key: "promise", label: "Promise", multiline: true, placeholder: "What will readers gain or feel by the end?" },
    { key: "summary", label: "Summary", multiline: true, placeholder: "A short overview of what the book is about" },
  ];

  return (
    <div className="flex h-full min-h-0 gap-4 p-6 mobile-stack mobile-px-4">
      {/* Left card: fields */}
      <div className="flex-1 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)]">
        <div className="px-6 py-6" style={{ maxWidth: 720 }}>
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Book Info</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Project metadata — not included in the manuscript.</p>
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
                      value={bookInfo[key]}
                      onChange={(e) => onChange({ ...bookInfo, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                    />
                  ) : (
                    <input
                      type="text"
                      value={bookInfo[key]}
                      onChange={(e) => onChange({ ...bookInfo, [key]: e.target.value })}
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

      {/* Right card: synopsis */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)]">
        <div className="px-6 pt-6 pb-3">
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Synopsis</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>A detailed overview of your book&rsquo;s narrative, structure, and key themes.</p>
        </div>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <textarea
            value={bookInfo.synopsis}
            onChange={(e) => onChange({ ...bookInfo, synopsis: e.target.value })}
            placeholder="Write your book synopsis here — describe the narrative arc, main themes, character journeys, and how the story unfolds from beginning to end…"
            className="h-full w-full resize-none bg-transparent px-0 py-0 text-[13px] leading-7 text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── AI Action Icons ───────────────────────────────────────── */

function AiActionBar({
  message,
  onUpdate,
}: {
  message: AiMessage;
  onUpdate: (updated: AiMessage) => void;
}) {
  function toggle(field: "is_favorite" | "is_liked" | "is_disliked" | "is_hidden" | "is_deleted") {
    const updated = { ...message, [field]: !message[field] };
    if (field === "is_liked" && updated.is_liked) updated.is_disliked = false;
    if (field === "is_disliked" && updated.is_disliked) updated.is_liked = false;
    onUpdate(updated);
  }

  const btnClass = "transition-colors";
  const activeColor = "var(--text-primary)";
  const inactiveColor = "var(--text-faint)";

  return (
    <div className="mt-2 flex items-center gap-3">
      <button title="Copy" className={btnClass} style={{ color: inactiveColor }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")} onMouseLeave={(e) => (e.currentTarget.style.color = inactiveColor)} onClick={() => navigator.clipboard.writeText(message.text)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      <button title={message.is_favorite ? "Unfavorite" : "Favorite"} className={btnClass} style={{ color: message.is_favorite ? "#fbbf24" : inactiveColor }} onMouseEnter={(e) => { if (!message.is_favorite) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_favorite) e.currentTarget.style.color = inactiveColor; }} onClick={() => toggle("is_favorite")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      </button>
      <button title={message.is_liked ? "Unlike" : "Like"} className={btnClass} style={{ color: message.is_liked ? activeColor : inactiveColor }} onMouseEnter={(e) => { if (!message.is_liked) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_liked) e.currentTarget.style.color = inactiveColor; }} onClick={() => toggle("is_liked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
      </button>
      <button title={message.is_disliked ? "Undo dislike" : "Dislike"} className={btnClass} style={{ color: message.is_disliked ? activeColor : inactiveColor }} onMouseEnter={(e) => { if (!message.is_disliked) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_disliked) e.currentTarget.style.color = inactiveColor; }} onClick={() => toggle("is_disliked")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
      </button>
      <button title={message.is_hidden ? "Unhide" : "Hide"} className={btnClass} style={{ color: message.is_hidden ? activeColor : inactiveColor }} onMouseEnter={(e) => { if (!message.is_hidden) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_hidden) e.currentTarget.style.color = inactiveColor; }} onClick={() => toggle("is_hidden")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      </button>
      <button title={message.is_deleted ? "Restore" : "Delete"} className={btnClass} style={{ color: message.is_deleted ? "#ef4444" : inactiveColor }} onMouseEnter={(e) => { if (!message.is_deleted) e.currentTarget.style.color = "var(--text-tertiary)"; }} onMouseLeave={(e) => { if (!message.is_deleted) e.currentTarget.style.color = inactiveColor; }} onClick={() => toggle("is_deleted")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
      <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>
        {message.created_at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ─── AI Panel ──────────────────────────────────────────────── */

function AiPanel({
  messages, onUpdateMessage, projectId, bookTitle, chapter, onAddMessage,
}: {
  messages: AiMessage[]; onUpdateMessage: (updated: AiMessage) => void; projectId: string; bookTitle: string; chapter: string; onAddMessage: (message: AiMessage) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AiFilter>("brainstorm");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    const trimmed = input.trim();
    onAddMessage(newAiMessage(Date.now(), "user", trimmed));
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/brainstorm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: trimmed, chapter, bookTitle, project_id: projectId }) });
      const data = await res.json();
      onAddMessage(newAiMessage(Date.now() + 1, "ai", res.ok && data.reply ? data.reply : "I couldn't generate a response right now. Please try again."));
    } catch { onAddMessage(newAiMessage(Date.now() + 1, "ai", "I couldn't generate a response right now. Please try again.")); }
    finally { setLoading(false); }
  }

  const filtered = filterMessages(messages, activeFilter);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center px-4 pt-3 pb-2" style={{ height: 40 }}>
        <span className="text-[12px] font-medium shrink-0 mr-auto" style={{ color: "var(--text-faint)" }}>AI Assistant</span>
        <div className="flex items-center gap-1" style={{ overflowX: "auto" }}>
          {AI_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${activeFilter === f.key ? "bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-5 pb-4">
          {filtered.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end"><p className="max-w-[85%] rounded-lg bg-[rgba(255,255,255,0.06)] px-4 py-2.5 text-[13px] text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p></div>
              ) : (
                <div><p className="text-[13px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p><AiActionBar message={msg} onUpdate={onUpdateMessage} /></div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-[12px] text-[var(--text-faint)] text-center py-8">{activeFilter === "brainstorm" ? "Start a conversation with your AI assistant." : `No ${activeFilter} messages.`}</p>}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border-default)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 transition-colors focus-within:border-[rgba(90,154,245,0.35)] focus-within:bg-[rgba(255,255,255,0.05)]">
          <textarea value={input} onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} placeholder="Ask a question or share an idea…" rows={1} style={{ minHeight: "1.5rem", maxHeight: "12.5rem" }} className="flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none leading-relaxed" />
          {loading ? <div className="mb-0.5 shrink-0 flex h-7 w-7 items-center justify-center"><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-tertiary)]" /></div>
          : input.trim() ? <button type="button" aria-label="Send" onClick={handleSubmit} className="mb-0.5 shrink-0 rounded-full bg-white p-1.5 text-black transition-opacity hover:opacity-80"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="13" x2="8" y2="3" /><polyline points="4,7 8,3 12,7" /></svg></button>
          : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Compose Page (split layout) — only for sections ───────── */

function ComposePage({
  sectionTitle, composeText, onComposeChange, aiMessages, onUpdateAiMessage, onAddAiMessage, projectId, bookTitle,
}: {
  sectionTitle: string; composeText: string; onComposeChange: (text: string) => void; aiMessages: AiMessage[]; onUpdateAiMessage: (updated: AiMessage) => void; onAddAiMessage: (message: AiMessage) => void; projectId: string; bookTitle: string;
}) {
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [dividerX, setDividerX] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    function handleMouseMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDividerX(Math.max(25, Math.min(75, ((ev.clientX - rect.left) / rect.width) * 100)));
    }
    function handleMouseUp() { dragging.current = false; document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="flex flex-col min-h-0" style={{ width: aiPanelOpen ? `${dividerX}%` : "100%" }}>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <RichTextEditor content={composeText} onChange={onComposeChange} label={sectionTitle} placeholder="Start writing…" />
        </div>
      </div>
      {aiPanelOpen && (
        <div className="shrink-0 flex items-center justify-center" style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }} onMouseDown={handleMouseDown}>
          <button onClick={() => setAiPanelOpen(false)} title="Close AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="3,1 7,5 3,9" /></svg>
          </button>
        </div>
      )}
      {!aiPanelOpen && (
        <div className="shrink-0 flex items-center" style={{ position: "relative", width: 16 }}>
          <button onClick={() => setAiPanelOpen(true)} title="Open AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, right: -11, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="7,1 3,5 7,9" /></svg>
          </button>
        </div>
      )}
      {aiPanelOpen && (
        <div className="min-h-0 flex flex-col pr-6 pb-6" style={{ width: `${100 - dividerX}%` }}>
          <div className="flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)]">
            <AiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} projectId={projectId} bookTitle={bookTitle} chapter={sectionTitle} onAddMessage={onAddAiMessage} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Chapter Overview (shown when clicking a chapter) ──────── */

function ChapterOverview({
  chapter, sections, onAddSection, onSelectSection,
}: {
  chapter: ChapterData; sections: SectionData[]; onAddSection: () => void; onSelectSection: (sectionId: string) => void;
}) {
  return (
    <div className="overflow-y-auto h-full px-8 py-8 mobile-px-4">
      <div style={{ maxWidth: 720 }}>
        <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>{chapter.title}</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{sections.length} section{sections.length !== 1 ? "s" : ""}</p>
        <div className="mt-6 flex flex-col gap-2">
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => onSelectSection(sec.id)}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
            >
              {sec.title}
            </button>
          ))}
          {sections.length === 0 && (
            <p className="text-[13px] text-[var(--text-faint)] mb-4">No sections yet. Add one to start writing.</p>
          )}
          <button
            onClick={onAddSection}
            className="mt-2 text-[12px] font-medium text-[var(--accent-blue)] hover:underline self-start"
          >
            + Add Section
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline Editable Title ─────────────────────────────────── */

function InlineTitle({
  value, onChange, className, style, autoFocus,
}: {
  value: string; onChange: (v: string) => void; className?: string; style?: React.CSSProperties; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      className={`bg-transparent border-none outline-none ${className ?? ""}`}
      style={{ padding: 0, ...style }}
    />
  );
}

/* ─── Main ProjectPage ──────────────────────────────────────── */

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { openMainSidebar } = useMainSidebar();
  const searchParams = useSearchParams();
  const [projectName, setProjectName] = useState<string>("");
  const [projectType, setProjectType] = useState<string>("Book");
  const [activeStage, setActiveStage] = useState<Stage>(() => {
    const stageParam = searchParams.get("stage");
    if (stageParam && STAGES.includes(stageParam as Stage)) return stageParam as Stage;
    return "Compose";
  });
  const [selection, setSelection] = useState<ActiveSelection>({ type: "book_info" });
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [confirmRemoveChapter, setConfirmRemoveChapter] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Record<string, AiMessage[]>>({});
  const [composeTexts, setComposeTexts] = useState<Record<string, string>>({});
  const [bookInfo, setBookInfo] = useState<BookInfo>(EMPTY_BOOK_INFO);
  const [bookVersions, setBookVersions] = useState<{ id: string; version_number: number; source: string; status: string; created_at: string; derived_status?: string }[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);

  useEffect(() => { setMobileSidebarOpen(false); }, [selection, activeStage]);

  // Load project record
  const projectLoadedRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) {
          setProjectName(data.name ?? "");
          if (data.type) setProjectType(data.type);
          if (data.book_info) {
            setBookInfo({ ...EMPTY_BOOK_INFO, ...data.book_info });
            if (Array.isArray(data.book_info.chapters) && data.book_info.chapters.length > 0) {
              // Migrate old data: ensure every chapter and section has a unique id
              const seenIds = new Set<string>();
              const migrated = data.book_info.chapters.map((ch: Record<string, unknown>) => {
                let chId = (ch.id as string) || crypto.randomUUID();
                if (seenIds.has(chId)) chId = crypto.randomUUID();
                seenIds.add(chId);
                const sections = Array.isArray(ch.sections) ? ch.sections.map((sec: Record<string, unknown>) => {
                  let secId = (sec.id as string) || crypto.randomUUID();
                  if (seenIds.has(secId)) secId = crypto.randomUUID();
                  seenIds.add(secId);
                  return { id: secId, title: (sec.title as string) || (sec.name as string) || "Untitled Section" };
                }) : [];
                return { id: chId, title: (ch.title as string) || (ch.name as string) || "Untitled Chapter", sections };
              });
              setChapters(migrated);
            }
          }
          setTimeout(() => { projectLoadedRef.current = true; }, 500);
        }
      });
  }, [projectId]);

  // Load persisted messages
  useEffect(() => {
    if (!projectId) return;
    async function loadMessages() {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { setMessagesLoaded(true); return; }
      const grouped: Record<string, typeof data> = {};
      for (const row of data) { const ch = row.chapter_id ?? "default"; if (!grouped[ch]) grouped[ch] = []; grouped[ch].push(row); }
      const newMessages: Record<string, AiMessage[]> = {};
      for (const [ch, rows] of Object.entries(grouped)) {
        newMessages[ch] = rows.map((row: Record<string, unknown>, i: number) => newAiMessage(i + 1, (row.role === "assistant" ? "ai" : "user") as AiMessage["role"], row.message as string));
      }
      setAiMessages((prev) => { const merged = { ...prev }; for (const [ch, msgs] of Object.entries(newMessages)) { if (!merged[ch] || merged[ch].length === 0) merged[ch] = msgs; } return merged; });
      setMessagesLoaded(true);
    }
    loadMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load book versions
  useEffect(() => { if (projectId) loadBookVersions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);
  async function loadBookVersions() { const res = await fetch(`/api/projects/${projectId}/versions`); const data = await res.json(); if (Array.isArray(data)) setBookVersions(data); }

  // Save book info with debounce
  const bookInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chaptersRef = useRef(chapters);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  const handleBookInfoChange = useCallback((updated: BookInfo) => {
    setBookInfo(updated);
    if (updated.title.trim()) setProjectName(updated.title.trim());
    if (bookInfoTimerRef.current) clearTimeout(bookInfoTimerRef.current);
    bookInfoTimerRef.current = setTimeout(() => {
      const patch: Record<string, unknown> = { id: projectId, book_info: { ...updated, chapters: chaptersRef.current } };
      if (updated.title.trim()) patch.name = updated.title.trim();
      fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    }, 800);
  }, [projectId]);

  // Auto-save chapters (debounced)
  const chaptersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookInfoRef = useRef(bookInfo);
  useEffect(() => { bookInfoRef.current = bookInfo; }, [bookInfo]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    if (chaptersTimerRef.current) clearTimeout(chaptersTimerRef.current);
    chaptersTimerRef.current = setTimeout(() => {
      const payload = { ...bookInfoRef.current, chapters };
      fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projectId, book_info: payload }) });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters]);

  // Auto-save compose texts (debounced)
  const composeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composeLoadedRef = useRef(false);

  useEffect(() => {
    if (!composeLoadedRef.current) { composeLoadedRef.current = true; return; }
    if (composeTimerRef.current) clearTimeout(composeTimerRef.current);
    composeTimerRef.current = setTimeout(() => {
      const allBlocks: Record<string, unknown>[] = [];
      for (const [key, text] of Object.entries(composeTexts)) {
        if (hasContent(text)) allBlocks.push({ id: crypto.randomUUID(), chapter: key, content: text, previousContent: null, sourceCompilationId: null });
      }
      fetch(`/api/projects/${projectId}/drafts`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks: allBlocks }) });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeTexts]);

  // Load compose texts from drafts
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/drafts`).then((res) => res.json()).then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        const texts: Record<string, string> = {};
        for (const row of data) { const ch = row.chapter as string; texts[ch] = texts[ch] ? texts[ch] + "\n\n" + (row.content as string) : (row.content as string); }
        setComposeTexts(texts);
      }
    });
  }, [projectId]);

  // ─── Chapter & Section handlers ────────────────────────────

  function handleAddChapter() {
    const id = crypto.randomUUID();
    const sectionId = crypto.randomUUID();
    const newChapter: ChapterData = {
      id,
      title: "Untitled Chapter",
      sections: [{ id: sectionId, title: "Introduction" }],
    };
    setChapters((prev) => [...prev, newChapter]);
    setExpandedChapters((prev) => ({ ...prev, [id]: true }));
    setSelection({ type: "chapter", chapterId: id });
    setAutoFocusId(id);
  }

  function handleAddSection(chapterId: string) {
    const sectionId = crypto.randomUUID();
    setChapters((prev) => prev.map((ch) => {
      if (ch.id !== chapterId) return ch;
      return { ...ch, sections: [...ch.sections, { id: sectionId, title: "Untitled Section" }] };
    }));
    setExpandedChapters((prev) => ({ ...prev, [chapterId]: true }));
    setSelection({ type: "section", chapterId, sectionId });
    setAutoFocusId(sectionId);
  }

  function handleRenameChapter(chapterId: string, newTitle: string) {
    setChapters((prev) => prev.map((ch) => ch.id === chapterId ? { ...ch, title: newTitle } : ch));
  }

  function handleRenameSection(chapterId: string, sectionId: string, newTitle: string) {
    setChapters((prev) => prev.map((ch) => {
      if (ch.id !== chapterId) return ch;
      return { ...ch, sections: ch.sections.map((s) => s.id === sectionId ? { ...s, title: newTitle } : s) };
    }));
  }

  function handleRemoveSection(chapterId: string, sectionId: string) {
    setChapters((prev) => prev.map((ch) => {
      if (ch.id !== chapterId) return ch;
      return { ...ch, sections: ch.sections.filter((s) => s.id !== sectionId) };
    }));
    if (selection.type === "section" && selection.sectionId === sectionId) {
      setSelection({ type: "chapter", chapterId });
    }
    setComposeTexts((prev) => { const n = { ...prev }; delete n[sectionId]; return n; });
    setAiMessages((prev) => { const n = { ...prev }; delete n[sectionId]; return n; });
  }

  function handleRemoveChapter(chapterId: string) {
    setChapters((prev) => prev.filter((ch) => ch.id !== chapterId));
    if (selection.type === "chapter" && selection.chapterId === chapterId) setSelection({ type: "book_info" });
    if (selection.type === "section" && selection.chapterId === chapterId) setSelection({ type: "book_info" });
    setConfirmRemoveChapter(null);
  }

  function handleComposeChange(key: string, text: string) {
    setComposeTexts((prev) => ({ ...prev, [key]: text }));
  }

  function handleAddAiMessage(key: string, message: AiMessage) {
    setAiMessages((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), message] }));
  }

  function handleUpdateAiMessage(key: string, updated: AiMessage) {
    setAiMessages((prev) => ({ ...prev, [key]: (prev[key] ?? []).map((m) => m.id === updated.id ? updated : m) }));
  }

  // ─── Publish ───────────────────────────────────────────────

  const [sendingToPublish, setSendingToPublish] = useState(false);
  const [sendToPublishSuccess, setSendToPublishSuccess] = useState(false);

  async function handleSendToPublish() {
    setSendingToPublish(true);
    setSendToPublishSuccess(false);
    const sections: { section_type: string; section_title: string; position: number; content: string }[] = [];
    let position = 0;

    // Prologue
    const prologueText = composeTexts["prologue"];
    if (prologueText && hasContent(prologueText)) {
      sections.push({ section_type: "prologue", section_title: "Prologue", position: position++, content: prologueText });
    }

    // Chapters → sections
    for (const ch of chapters) {
      for (const sec of ch.sections) {
        const text = composeTexts[sec.id];
        if (text && hasContent(text)) {
          sections.push({ section_type: "chapter", section_title: `${ch.title} — ${sec.title}`, position: position++, content: text });
        }
      }
    }

    // Epilogue
    const epilogueText = composeTexts["epilogue"];
    if (epilogueText && hasContent(epilogueText)) {
      sections.push({ section_type: "epilogue", section_title: "Epilogue", position: position++, content: epilogueText });
    }

    const res = await fetch(`/api/projects/${projectId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections }) });
    if (res.ok) { setSendToPublishSuccess(true); await loadBookVersions(); setTimeout(() => setSendToPublishSuccess(false), 3000); }
    setSendingToPublish(false);
  }

  // ─── Derive what to render ─────────────────────────────────

  const activeKey = selectionKey(selection);
  const isWritableSection = selection.type === "section" || selection.type === "prologue" || selection.type === "epilogue";
  const composeKey = selection.type === "section" ? selection.sectionId : selection.type === "prologue" ? "prologue" : selection.type === "epilogue" ? "epilogue" : "";

  const currentSectionTitle = (() => {
    if (selection.type === "prologue") return "Prologue";
    if (selection.type === "epilogue") return "Epilogue";
    if (selection.type === "section") {
      const ch = chapters.find((c) => c.id === selection.chapterId);
      const sec = ch?.sections.find((s) => s.id === selection.sectionId);
      return sec?.title ?? "Untitled Section";
    }
    return "";
  })();

  // Render App mode
  if (projectType === "App") {
    return <AppMode projectId={projectId} projectName={projectName} />;
  }

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Project header bar */}
      <div
        className="flex shrink-0 items-center gap-4 mobile-px-4"
        style={{ height: 56, background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)", padding: "0 24px" }}
      >
        <button className="flex items-center justify-center" onClick={openMainSidebar} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }} aria-label="Open navigation">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
        </button>
        <span className="text-[18px] mobile-text-15 font-bold" style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {bookInfo.title || projectName || "Untitled Project"}
        </span>
        {bookInfo.genre && <span className="mobile-hidden text-[13px]" style={{ color: "var(--text-muted)" }}>{bookInfo.genre}</span>}
        <span className="mobile-hidden" style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: projectType === "Book" ? "rgba(74,222,128,0.18)" : projectType === "Music" ? "rgba(90,154,245,0.18)" : "rgba(251,191,36,0.18)", color: projectType === "Book" ? "#4ade80" : projectType === "Music" ? "#5a9af5" : "#fbbf24" }}>{projectType}</span>
        <div style={{ flex: 1 }} />
        <Link href="/" className="text-[13px] font-medium transition-colors" style={{ color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>Exit</Link>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>
        {mobileSidebarOpen && <div className="desktop-hidden" style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileSidebarOpen(false)} />}

        {/* Left sidebar */}
        {activeStage !== "Publish" && (
        <aside className={`shrink-0 border-r border-[var(--border-default)] px-4 py-4 overflow-y-auto ${mobileSidebarOpen ? "" : "mobile-hidden"}`} style={{ width: 280, background: "var(--surface-1)", zIndex: 41 }}>
          <nav className="flex flex-col gap-0.5 text-[13px]">
            {/* Book Info */}
            <button onClick={() => setSelection({ type: "book_info" })} className={`w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors ${selection.type === "book_info" ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>Book Info</button>

            {/* Prologue */}
            <button onClick={() => setSelection({ type: "prologue" })} className={`w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors ${selection.type === "prologue" ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>Prologue</button>

            {/* Chapters */}
            <div className="mt-2 mb-1 flex items-center justify-between px-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Chapters</span>
              <button onClick={handleAddChapter} title="Add chapter" className="text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" /></svg>
              </button>
            </div>

            {chapters.map((ch) => {
              const isExpanded = expandedChapters[ch.id] ?? false;
              const isChapterActive = selection.type === "chapter" && selection.chapterId === ch.id;
              const isChildActive = selection.type === "section" && selection.chapterId === ch.id;

              return (
                <div key={ch.id}>
                  <div className="group flex items-center">
                    <button onClick={() => setExpandedChapters((prev) => ({ ...prev, [ch.id]: !prev[ch.id] }))} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                    </button>
                    <button onClick={() => { setSelection({ type: "chapter", chapterId: ch.id }); if (!isExpanded) setExpandedChapters((prev) => ({ ...prev, [ch.id]: true })); }} className={`flex-1 rounded px-1 py-1.5 text-left min-w-0 transition-colors flex items-baseline ${isChapterActive ? "bg-[rgba(255,255,255,0.06)]" : ""}`}>
                      <InlineTitle
                        value={ch.title}
                        onChange={(v) => handleRenameChapter(ch.id, v)}
                        autoFocus={autoFocusId === ch.id}
                        className="text-[13px] font-medium min-w-0"
                        style={{ color: isChapterActive || isChildActive ? "var(--text-primary)" : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto" }}
                      />
                      {ch.sections.length > 0 && (
                        <span className="shrink-0 text-[10px] ml-1" style={{ color: "var(--text-faint)" }}>({ch.sections.length})</span>
                      )}
                    </button>
                    <button onClick={() => handleAddSection(ch.id)} title="Add section" className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-0.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
                    </button>
                    <button onClick={() => setConfirmRemoveChapter(ch.id)} title="Remove chapter" className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all pr-1">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                      {ch.sections.map((sec) => {
                        const isSectionActive = selection.type === "section" && selection.sectionId === sec.id;
                        return (
                          <div key={sec.id} className="group/sec flex items-center">
                            <button onClick={() => setSelection({ type: "section", chapterId: ch.id, sectionId: sec.id })} className={`flex-1 rounded px-2 py-1 text-left min-w-0 transition-colors ${isSectionActive ? "bg-[rgba(255,255,255,0.06)]" : ""}`}>
                              <InlineTitle
                                value={sec.title}
                                onChange={(v) => handleRenameSection(ch.id, sec.id, v)}
                                autoFocus={autoFocusId === sec.id}
                                className="w-full text-[12px]"
                                style={{ color: isSectionActive ? "var(--text-primary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              />
                            </button>
                            <button
                              onClick={() => handleRemoveSection(ch.id, sec.id)}
                              title="Remove section"
                              className="shrink-0 opacity-0 group-hover/sec:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all pr-1"
                            >
                              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
                            </button>
                          </div>
                        );
                      })}
                      {ch.sections.length === 0 && (
                        <button onClick={() => handleAddSection(ch.id)} className="px-2 py-1 text-[11px] text-[var(--text-faint)] hover:text-[var(--accent-blue)] transition-colors text-left">+ Add Section</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Epilogue */}
            <button onClick={() => setSelection({ type: "epilogue" })} className={`mt-1 w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors ${selection.type === "epilogue" ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>Epilogue</button>
          </nav>
        </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {/* Stage navigation */}
          <div className="flex shrink-0 gap-1 px-8 mobile-px-4" style={{ overflowX: "auto", paddingTop: 20, paddingBottom: 20 }}>
            {STAGES.map((stage) => (
              <button key={stage} onClick={() => setActiveStage(stage)} className={`px-3 py-1.5 text-[13px] rounded transition-colors ${activeStage === stage ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-tertiary)]"}`} style={activeStage === stage ? { borderBottom: "2px solid var(--accent-blue)" } : undefined}>{stage}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
          {/* ─── COMPOSE ─── */}
          {activeStage === "Compose" && selection.type === "book_info" ? (
            <BookInfoPanel bookInfo={bookInfo} onChange={handleBookInfoChange} />
          ) : activeStage === "Compose" && selection.type === "chapter" ? (
            <ChapterOverview
              chapter={chapters.find((c) => c.id === selection.chapterId)!}
              sections={chapters.find((c) => c.id === selection.chapterId)?.sections ?? []}
              onAddSection={() => handleAddSection(selection.chapterId)}
              onSelectSection={(sectionId) => setSelection({ type: "section", chapterId: selection.chapterId, sectionId })}
            />
          ) : activeStage === "Compose" && isWritableSection ? (
            <ComposePage
              sectionTitle={currentSectionTitle}
              composeText={composeTexts[composeKey] ?? ""}
              onComposeChange={(text) => handleComposeChange(composeKey, text)}
              aiMessages={aiMessages[composeKey] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage(composeKey, updated)}
              onAddAiMessage={(msg) => handleAddAiMessage(composeKey, msg)}
              projectId={projectId}
              bookTitle={bookInfo.title || projectName || "this book"}
            />

          /* ─── MANUSCRIPT ─── */
          ) : activeStage === "Manuscript" ? (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4">
              <div className="mx-auto" style={{ maxWidth: 900 }}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>Manuscript</h2>
                  <div className="flex items-center gap-3">
                    {sendToPublishSuccess && <span className="text-[13px] text-green-400">Snapshot saved!</span>}
                    <button onClick={handleSendToPublish} disabled={sendingToPublish} className="text-[13px] font-medium transition-all disabled:opacity-40" style={{ height: 36, padding: "0 20px", borderRadius: 20, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7, #ec4899)", color: "#fff", cursor: sendingToPublish ? "not-allowed" : "pointer" }}>
                      {sendingToPublish ? "Saving..." : "Send to Publish"}
                    </button>
                  </div>
                </div>

                {/* Prologue */}
                {hasContent(composeTexts["prologue"] ?? "") && (
                  <div className="mb-8" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Prologue</span>
                    </div>
                    <div style={{ padding: "16px 20px" }}><div className="prose-rendered" dangerouslySetInnerHTML={{ __html: composeTexts["prologue"] ?? "" }} /></div>
                  </div>
                )}

                {/* Chapters with their sections */}
                {chapters.map((ch) => {
                  const sectionsWithContent = ch.sections.filter((sec) => hasContent(composeTexts[sec.id] ?? ""));
                  if (sectionsWithContent.length === 0) return null;
                  return (
                    <div key={ch.id} className="mb-8">
                      <h3 className="text-[16px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{ch.title}</h3>
                      {sectionsWithContent.map((sec) => (
                        <div key={sec.id} className="mb-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
                          <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{sec.title}</span>
                          </div>
                          <div style={{ padding: "16px 20px" }}><div className="prose-rendered" dangerouslySetInnerHTML={{ __html: composeTexts[sec.id] ?? "" }} /></div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* Epilogue */}
                {hasContent(composeTexts["epilogue"] ?? "") && (
                  <div className="mb-8" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Epilogue</span>
                    </div>
                    <div style={{ padding: "16px 20px" }}><div className="prose-rendered" dangerouslySetInnerHTML={{ __html: composeTexts["epilogue"] ?? "" }} /></div>
                  </div>
                )}

                {/* Empty state */}
                {!hasContent(composeTexts["prologue"] ?? "") && !hasContent(composeTexts["epilogue"] ?? "") && chapters.every((ch) => ch.sections.every((sec) => !hasContent(composeTexts[sec.id] ?? ""))) && (
                  <p className="text-[13px] text-[var(--text-faint)]">Your manuscript will appear here once you add content in Compose.</p>
                )}
              </div>
            </div>

          /* ─── PUBLISH ─── */
          ) : activeStage === "Publish" ? (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>Publish</h2>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Snapshots of your manuscript</p>
                </div>
              </div>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>All Versions</span>
                </div>
                {bookVersions.length === 0 ? (
                  <div style={{ padding: "32px 14px" }}><p className="text-[13px] text-[var(--text-faint)]">No versions yet. Use &ldquo;Send to Publish&rdquo; from the Manuscript tab to create a snapshot.</p></div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <th className="pb-2 pl-3.5 pr-1 pt-2.5 font-medium w-10" style={{ fontSize: 11 }}></th>
                        <th className="pb-2 pr-1 pt-2.5 font-medium w-10" style={{ fontSize: 11 }}></th>
                        <th className="pb-2 pr-6 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Version</th>
                        <th className="pb-2 pr-6 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Date</th>
                        <th className="pb-2 pr-6 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Source</th>
                        <th className="pb-2 pr-3.5 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookVersions.map((v) => {
                        const ds = v.derived_status ?? v.status;
                        const statusLabel = ds === "finalized" ? "Finalized" : ds === "in_progress" ? "In Progress" : "Pending";
                        const statusColor = ds === "finalized" ? "text-green-400" : ds === "in_progress" ? "text-yellow-400" : "text-red-400/60";
                        return (
                        <tr key={v.id} className="group" style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.12s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <td className="py-2.5 pl-3.5 pr-1 w-10">
                            <button onClick={() => router.push(`/projects/${projectId}/book/${v.id}`)} className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]" title="Final Edit">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                          </td>
                          <td className="py-2.5 pr-1 w-10">
                            <button onClick={() => console.log("Print PDF - version:", v.id)} className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]" title="Print PDF">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                            </button>
                          </td>
                          <td className="py-2.5 pr-6 font-medium text-[var(--text-primary)]">Version {v.version_number}</td>
                          <td className="py-2.5 pr-6 text-[var(--text-tertiary)]">{new Date(v.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                          <td className="py-2.5 pr-6 text-[var(--text-tertiary)] capitalize">{v.source} snapshot</td>
                          <td className="py-2.5 pr-3.5"><span className={`text-lg ${statusColor}`} title={statusLabel}>&#9679;</span></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4"><p className="text-[13px] text-[var(--text-faint)]">Select a tab above.</p></div>
          )}
          </div>
        </div>
      </div>

      {/* Confirm remove chapter dialog */}
      {confirmRemoveChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Remove chapter?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">All sections, content, and AI conversations for this chapter will be permanently deleted.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmRemoveChapter(null)} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]">Cancel</button>
              <button onClick={() => handleRemoveChapter(confirmRemoveChapter)} className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
