"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppMode from "./app-mode";
import { useWorkspace, EMPTY_WORKSPACE, type WorkspaceData } from "./workspace";
import { useMainSidebar } from "@/components/layout/sidebar-context";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { ThemeToggle } from "@/components/layout/theme-context";

const TOP_TABS = ["Book", "Workspace"] as const;
type TopTab = (typeof TOP_TABS)[number];
const STAGES = ["Compose", "Manuscript", "Publish"] as const;

const BOOK_LANGUAGES = [
  "English", "Spanish", "Portuguese", "French", "German", "Italian",
  "Chinese", "Japanese", "Korean", "Arabic", "Hindi", "Russian",
  "Dutch", "Swedish", "Polish", "Turkish", "Indonesian", "Vietnamese",
];

/** Check if HTML content has any visible text */
function hasContent(html: string): boolean {
  if (!html) return false;
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 0;
}

/** Remove paragraphs that only contain dashes/horizontal rules */
function cleanManuscriptHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<p>\s*[-–—]{2,}\s*<\/p>/gi, "")
    .replace(/<p>\s*---\s*<\/p>/gi, "")
    .replace(/<hr\s*\/?>/gi, "");
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
  year_published: string;
  primary_language: string;
  target_languages: string;
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
  year_published: "",
  primary_language: "",
  target_languages: "",
  synopsis: "",
};

/* ─── BookInfoPanel ─────────────────────────────────────────── */

function BookInfoPanel({
  bookInfo,
  onChange,
  aiMessages,
  onUpdateAiMessage,
  onAddAiMessage,
  projectId,
}: {
  bookInfo: BookInfo;
  onChange: (updated: BookInfo) => void;
  aiMessages: AiMessage[];
  onUpdateAiMessage: (updated: AiMessage) => void;
  onAddAiMessage: (message: AiMessage) => void;
  projectId: string;
}) {
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fields: { key: keyof BookInfo; label: string; multiline?: boolean; placeholder?: string }[] = [
    { key: "title", label: "Title", placeholder: "e.g. Life Basics 101" },
    { key: "subtitle", label: "Subtitle", placeholder: "e.g. A guide to living intentionally" },
    { key: "author", label: "Author", placeholder: "e.g. Tony Medina" },
    { key: "genre", label: "Genre", placeholder: "e.g. Self-help, Memoir, Fiction" },
    { key: "tone", label: "Tone", placeholder: "e.g. Warm, direct, conversational" },
    { key: "year_published", label: "Year Published", placeholder: "e.g. 2026" },
    { key: "one_line_hook", label: "One-Line Hook", multiline: false, placeholder: "A single sentence that captures the essence of the book" },
    { key: "audience", label: "Audience", multiline: true, placeholder: "Who is this book for?" },
    { key: "promise", label: "Promise", multiline: true, placeholder: "What will readers gain or feel by the end?" },
  ];

  return (
    <div className="flex h-full min-h-0 gap-4 p-6 mobile-stack mobile-p-3">
      {/* Left card: fields */}
      <div className="flex-1 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
        <div className="px-6 py-6 mobile-px-4" style={{ maxWidth: 720 }}>
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
                      className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                    />
                  ) : (
                    <input
                      type="text"
                      value={bookInfo[key]}
                      onChange={(e) => onChange({ ...bookInfo, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                    />
                  )}
                </div>
              </div>
            ))}

            {/* ── Language Settings ────────────────────────── */}
            <div className="mt-4 pt-5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Language</span>
            </div>

            {/* Primary Language */}
            <div className="flex gap-6 mobile-stack" style={{ alignItems: "flex-start" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: 10, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                Primary Language
              </label>
              <div className="flex-1">
                <select
                  value={bookInfo.primary_language}
                  onChange={(e) => onChange({ ...bookInfo, primary_language: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-secondary)] outline-none cursor-pointer focus:border-[rgba(90,154,245,0.35)] transition-colors"
                  style={{ colorScheme: "dark" }}
                >
                  <option value="">Select language...</option>
                  {BOOK_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>The language your original manuscript is written in.</p>
              </div>
            </div>

            {/* Target Languages */}
            <div className="flex gap-6 mobile-stack" style={{ alignItems: "flex-start" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: 10, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                Target Languages
              </label>
              <div className="flex-1">
                {(() => {
                  const selected = bookInfo.target_languages ? bookInfo.target_languages.split(",").map((l) => l.trim()).filter(Boolean) : [];
                  const available = BOOK_LANGUAGES.filter((l) => l !== bookInfo.primary_language && !selected.includes(l));
                  function addLang(lang: string) { if (lang) onChange({ ...bookInfo, target_languages: [...selected, lang].join(", ") }); }
                  function removeLang(lang: string) { onChange({ ...bookInfo, target_languages: selected.filter((l) => l !== lang).join(", ") }); }
                  return (
                    <>
                      {selected.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {selected.map((lang) => (
                            <span key={lang} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px]" style={{ background: "var(--overlay-active)", color: "var(--text-secondary)" }}>
                              {lang}
                              <button onClick={() => removeLang(lang)} className="text-[var(--text-faint)] hover:text-[var(--text-primary)] transition-colors" style={{ lineHeight: 1 }}>&times;</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <select
                        value=""
                        onChange={(e) => { addLang(e.target.value); e.target.value = ""; }}
                        className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-secondary)] outline-none cursor-pointer focus:border-[rgba(90,154,245,0.35)] transition-colors"
                        style={{ colorScheme: "dark" }}
                      >
                        <option value="">Add a language...</option>
                        {available.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>Additional languages you may want to create localized editions for.</p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right card: synopsis */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]" style={{ minHeight: 250 }}>
        <div className="px-6 pt-6 pb-3 mobile-px-4">
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

      {/* Mobile AI Assistant */}
      <button
        className="desktop-hidden shrink-0 flex items-center justify-center gap-2 py-2 transition-colors"
        onClick={() => setMobileAiOpen((v) => !v)}
        style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-faint)" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{mobileAiOpen ? "Hide AI Assistant" : "Show AI Assistant"}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ color: "var(--text-faint)" }}><polyline points={mobileAiOpen ? "1,3 5,7 9,3" : "1,7 5,3 9,7"} /></svg>
      </button>
      {mobileAiOpen && (
        <div className="desktop-hidden shrink-0 mobile-px-4 pb-4" style={{ minHeight: 300 }}>
          <div className="h-full rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]" style={{ minHeight: 300 }}>
            <AiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} projectId={projectId} bookTitle={bookInfo.title || "this book"} chapter="Book Info" onAddMessage={onAddAiMessage} />
          </div>
        </div>
      )}

      {/* Desktop AI drawer trigger */}
      <button
        className="mobile-hidden fixed flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)] shadow-lg"
        onClick={() => setDrawerOpen((v) => !v)}
        style={{ bottom: 24, right: 24, width: 44, height: 44, zIndex: 49 }}
        title={drawerOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: drawerOpen ? "var(--text-primary)" : "var(--text-faint)" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </button>

      {/* Desktop AI drawer */}
      {drawerOpen && (
        <div className="mobile-hidden fixed flex flex-col border-l border-[var(--border-default)] bg-[var(--surface-1)] shadow-2xl" style={{ top: 56, right: 0, bottom: 0, width: 380, zIndex: 48, transition: "transform 0.2s" }}>
          <div className="shrink-0 flex items-center px-4 pt-3 pb-2" style={{ height: 46, borderBottom: "1px solid var(--border-default)" }}>
            <span className="text-[12px] font-medium" style={{ color: "var(--text-faint)" }}>AI Assistant</span>
            <button onClick={() => setDrawerOpen(false)} className="ml-auto flex items-center justify-center rounded transition-colors hover:bg-[var(--overlay-hover)]" style={{ width: 24, height: 24, color: "var(--text-faint)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <AiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} projectId={projectId} bookTitle={bookInfo.title || "this book"} chapter="Book Info" onAddMessage={onAddAiMessage} />
          </div>
        </div>
      )}
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
                <div className="flex justify-end"><p className="max-w-[85%] rounded-lg bg-[var(--overlay-active)] px-4 py-2.5 text-[13px] text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p></div>
              ) : (
                <div><p className="text-[13px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">{msg.text}</p><AiActionBar message={msg} onUpdate={onUpdateMessage} /></div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-[12px] text-[var(--text-faint)] text-center py-8">{activeFilter === "brainstorm" ? "Start a conversation with your AI assistant." : `No ${activeFilter} messages.`}</p>}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0" style={{ padding: "8px 14px 10px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
        <div
          className="flex items-center gap-2 transition-colors focus-within:border-[rgba(90,154,245,0.3)]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 20, padding: "3px 8px 3px 12px" }}
        >
          <span style={{ color: "var(--text-faint)", fontSize: 16, flexShrink: 0, lineHeight: 1 }}>+</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
            placeholder="Add an idea, ask a question, or give direction..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-faint)]"
            style={{ padding: "5px 0", fontFamily: "inherit" }}
          />
          {loading ? (
            <div className="flex items-center justify-center" style={{ width: 24, height: 24, flexShrink: 0 }}>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-tertiary)]" />
            </div>
          ) : (
            <button
              type="button"
              aria-label="Send"
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex items-center justify-center transition-colors"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "none",
                flexShrink: 0,
                cursor: input.trim() ? "pointer" : "default",
                fontSize: 12,
                background: input.trim() ? "#fff" : "transparent",
                color: input.trim() ? "var(--surface-1)" : "var(--text-faint)",
              }}
            >
              ↑
            </button>
          )}
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
    <div ref={containerRef} className="flex h-full min-h-0 mobile-col">
      <div className="flex flex-col min-h-0" style={{ width: aiPanelOpen ? `${dividerX}%` : "100%" }}>
        <div className="flex-1 min-h-0 px-6 pb-6 mobile-px-4">
          <RichTextEditor content={composeText} onChange={onComposeChange} label={sectionTitle} placeholder="Start writing…" />
        </div>
      </div>
      {/* Mobile AI toggle */}
      <button
        className="desktop-hidden shrink-0 flex items-center justify-center gap-2 py-2 transition-colors"
        onClick={() => setAiPanelOpen((v) => !v)}
        style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-faint)" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{aiPanelOpen ? "Hide AI Assistant" : "Show AI Assistant"}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ color: "var(--text-faint)" }}><polyline points={aiPanelOpen ? "1,3 5,7 9,3" : "1,7 5,3 9,7"} /></svg>
      </button>
      {/* Divider — desktop only */}
      {aiPanelOpen && (
        <div className="shrink-0 flex items-center justify-center mobile-hidden" style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }} onMouseDown={handleMouseDown}>
          <button onClick={() => setAiPanelOpen(false)} title="Close AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="3,1 7,5 3,9" /></svg>
          </button>
        </div>
      )}
      {!aiPanelOpen && (
        <div className="shrink-0 flex items-center mobile-hidden" style={{ position: "relative", width: 16 }}>
          <button onClick={() => setAiPanelOpen(true)} title="Open AI panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, right: -11, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="7,1 3,5 7,9" /></svg>
          </button>
        </div>
      )}
      {aiPanelOpen && (
        <div className="min-h-0 flex flex-col pr-6 pb-6 mobile-px-4" style={{ width: `${100 - dividerX}%` }}>
          <div className="flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]" style={{ minHeight: 300 }}>
            <AiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} projectId={projectId} bookTitle={bookTitle} chapter={sectionTitle} onAddMessage={onAddAiMessage} />
          </div>
        </div>
      )}
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

/* ─── Publish Sidebar ──────────────────────────────────────── */

function PublishSidebar({
  chapters, composeTexts, bookVersions, bookInfo, selectedVersionId, onPreview, onAdapt,
}: {
  chapters: ChapterData[];
  composeTexts: Record<string, string>;
  bookVersions: { id: string; version_number: number; source: string; status: string; created_at: string; derived_status?: string }[];
  bookInfo: BookInfo;
  selectedVersionId: string | null;
  onPreview: (versionId: string) => void;
  onAdapt: () => void;
}) {
  // ── Live data calculations ────────────────────────────────
  const totalChapters = chapters.length;
  const totalSections = chapters.reduce((sum, ch) => sum + ch.sections.length, 0);

  // Word count from all composed content
  const allTexts = Object.values(composeTexts).filter((t) => hasContent(t));
  const totalWordCount = allTexts.reduce((sum, t) => {
    const stripped = t.replace(/<[^>]*>/g, "").trim();
    return sum + stripped.split(/\s+/).filter(Boolean).length;
  }, 0);

  const estimatedPages = Math.max(1, Math.ceil(totalWordCount / 250));

  // Status logic
  const hasVersions = bookVersions.length > 0;
  const hasManuscriptContent = allTexts.length > 0;
  const latestVersion = bookVersions[0];
  const latestStatus = latestVersion?.derived_status ?? latestVersion?.status ?? "";
  const reviewComplete = latestStatus === "finalized";

  type StatusLevel = "complete" | "warning" | "incomplete";
  const statuses: { label: string; level: StatusLevel }[] = [
    { label: "Draft Completed", level: hasManuscriptContent ? "complete" : "incomplete" },
    { label: "Manuscript Ready", level: hasVersions ? "complete" : hasManuscriptContent ? "warning" : "incomplete" },
    { label: "Review Complete", level: reviewComplete ? "complete" : hasVersions ? "warning" : "incomplete" },
    { label: "Ready to Publish", level: reviewComplete ? "complete" : "incomplete" },
  ];

  const dotColor = (level: StatusLevel) =>
    level === "complete" ? "var(--accent-green)" : level === "warning" ? "#fbbf24" : "var(--text-faint)";

  return (
    <div className="flex flex-col gap-4 px-4 pt-5 pb-4">
      {/* 1. Project Info */}
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] p-4">
        <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{bookInfo.title || "Untitled"}</span>
        {bookInfo.subtitle && <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>{bookInfo.subtitle}</p>}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Author</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{bookInfo.author || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Category</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{bookInfo.genre || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Year Published</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{bookInfo.year_published || "—"}</span>
          </div>
        </div>
      </div>

      {/* 2. Quick Info */}
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] p-4">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Quick Info</span>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Total Chapters</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{totalChapters}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Total Sections</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{totalSections}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Word Count</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{totalWordCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Estimated Pages</span>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{estimatedPages}</span>
          </div>
        </div>
      </div>

      {/* 3. Project Status */}
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] p-4">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Project Status</span>
        <div className="mt-3 flex flex-col gap-2.5">
          {statuses.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(s.level), flexShrink: 0 }} />
              <span className="text-[12px]" style={{ color: s.level === "complete" ? "var(--text-secondary)" : "var(--text-muted)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Quick Actions */}
      {(() => {
        const latestVer = bookVersions[0] ?? null;
        const selectedVer = selectedVersionId ? bookVersions.find((v) => v.id === selectedVersionId) ?? null : null;
        const activeVersion = selectedVer || latestVer;
        const isLatest = activeVersion?.id === latestVer?.id;
        const actionsEnabled = !!activeVersion;

        return (
          <div className="rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] p-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Quick Actions</span>
            <div className="mt-3 flex flex-col gap-2">
              {/* Active version label */}
              {activeVersion ? (
                <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>
                  Version: v{activeVersion.version_number} &middot; {new Date(activeVersion.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{isLatest && !selectedVer ? " (Latest)" : ""}
                </p>
              ) : (
                <p className="text-[11px] mb-1" style={{ color: "var(--text-faint)" }}>No versions available yet</p>
              )}
              <button
                disabled={!actionsEnabled}
                onClick={() => { if (activeVersion) onPreview(activeVersion.id); }}
                className="w-full rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)] disabled:opacity-40 disabled:cursor-default"
                style={{ color: actionsEnabled ? "var(--text-secondary)" : "var(--text-muted)" }}
              >
                Preview
              </button>
              {/* TODO: Wire download to generate PDF/DOCX export of activeVersion */}
              <button
                disabled={!actionsEnabled}
                className="w-full rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)] disabled:opacity-40 disabled:cursor-default"
                style={{ color: actionsEnabled ? "var(--text-secondary)" : "var(--text-muted)" }}
              >
                Download
              </button>
              <button
                onClick={onAdapt}
                className="w-full rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)]"
                style={{ color: "var(--text-secondary)" }}
              >
                Adapt to Another Language
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Adapt Language Modal ─────────────────────────────────── */

const ADAPTATION_STYLES = [
  { value: "faithful", label: "Faithful", desc: "Stays close to original wording" },
  { value: "natural", label: "Natural", desc: "Prioritizes fluency in target language" },
  { value: "simple", label: "Simple", desc: "Uses simpler vocabulary and shorter sentences" },
  { value: "formal", label: "Formal", desc: "Elevates register for professional audiences" },
  { value: "market-friendly", label: "Market-Friendly", desc: "Adapted for commercial appeal in target market" },
];

const TONE_HANDLING = [
  { value: "keep", label: "Keep Original Tone" },
  { value: "slight", label: "Slightly Localize Tone" },
  { value: "full", label: "Fully Adapt Tone" },
];

const LANGUAGE_OPTIONS = BOOK_LANGUAGES;

function AdaptLanguageModal({
  onClose,
  onCreate,
  primaryLanguage,
  existingLanguages,
}: {
  onClose: () => void;
  onCreate: (config: { targetLanguage: string; adaptationStyle: string; toneHandling: string }) => void;
  primaryLanguage: string;
  existingLanguages: string[];
}) {
  const [targetLanguage, setTargetLanguage] = useState("");
  const [adaptationStyle, setAdaptationStyle] = useState("natural");
  const [toneHandling, setToneHandling] = useState("slight");

  const existingLower = existingLanguages.map((l) => l.toLowerCase());
  const availableLanguages = LANGUAGE_OPTIONS.filter((l) => !existingLower.includes(l.toLowerCase()));

  const canCreate = targetLanguage.trim() !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Adapt to Another Language</h2>
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          This creates a new localized edition in another language. It preserves meaning and tone, but wording may change naturally for fluency and cultural fit.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {/* Target Language */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Target Language</label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-secondary)] outline-none cursor-pointer focus:border-[rgba(90,154,245,0.35)] transition-colors"
              style={{ colorScheme: "dark" }}
            >
              <option value="">Select language...</option>
              {availableLanguages.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Adaptation Style */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Adaptation Style</label>
            <div className="mt-2 flex flex-col gap-1.5">
              {ADAPTATION_STYLES.map((s) => (
                <label key={s.value} className={`flex items-center gap-2.5 rounded-md px-3 py-2 cursor-pointer transition-colors ${adaptationStyle === s.value ? "bg-[var(--overlay-active)]" : "hover:bg-[var(--overlay-hover)]"}`}>
                  <input type="radio" name="adapt-style" value={s.value} checked={adaptationStyle === s.value} onChange={() => setAdaptationStyle(s.value)} className="accent-[var(--accent-blue)]" style={{ width: 14, height: 14 }} />
                  <div>
                    <span className="text-[13px] font-medium" style={{ color: adaptationStyle === s.value ? "var(--text-primary)" : "var(--text-secondary)" }}>{s.label}</span>
                    <span className="ml-2 text-[11px]" style={{ color: "var(--text-faint)" }}>{s.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tone Handling */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Tone Handling</label>
            <div className="mt-2 flex flex-col gap-1.5">
              {TONE_HANDLING.map((t) => (
                <label key={t.value} className={`flex items-center gap-2.5 rounded-md px-3 py-2 cursor-pointer transition-colors ${toneHandling === t.value ? "bg-[var(--overlay-active)]" : "hover:bg-[var(--overlay-hover)]"}`}>
                  <input type="radio" name="tone-handle" value={t.value} checked={toneHandling === t.value} onChange={() => setToneHandling(t.value)} className="accent-[var(--accent-blue)]" style={{ width: 14, height: 14 }} />
                  <span className="text-[13px]" style={{ color: toneHandling === t.value ? "var(--text-primary)" : "var(--text-secondary)" }}>{t.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
          <button
            onClick={() => { if (canCreate) onCreate({ targetLanguage, adaptationStyle, toneHandling }); }}
            disabled={!canCreate}
            className="rounded-lg px-5 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)", border: "none", cursor: canCreate ? "pointer" : "default" }}
          >
            Create Localized Edition
          </button>
        </div>
      </div>
    </div>
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
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showAdaptModal, setShowAdaptModal] = useState(false);
  const [publishLang, setPublishLang] = useState("");
  const [topTab, setTopTab] = useState<TopTab>("Book");
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const workspace = useWorkspace({
    projectId,
    bookTitle: bookInfo.title || projectName || "this book",
    data: workspaceData,
    chapters: chapters.map((ch) => ({ title: ch.title, sections: ch.sections.map((s) => ({ title: s.title })) })),
    onChange: setWorkspaceData,
  });

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
          if (data.book_info?.workspace) {
            setWorkspaceData({ ...EMPTY_WORKSPACE, ...data.book_info.workspace });
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
      const patch: Record<string, unknown> = { id: projectId, book_info: { ...updated, chapters: chaptersRef.current, workspace: workspaceRef.current } };
      if (updated.title.trim()) patch.name = updated.title.trim();
      fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    }, 800);
  }, [projectId]);

  // Auto-save chapters (debounced)
  const chaptersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookInfoRef = useRef(bookInfo);
  useEffect(() => { bookInfoRef.current = bookInfo; }, [bookInfo]);
  const workspaceRef = useRef(workspaceData);
  useEffect(() => { workspaceRef.current = workspaceData; }, [workspaceData]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    if (chaptersTimerRef.current) clearTimeout(chaptersTimerRef.current);
    chaptersTimerRef.current = setTimeout(() => {
      const payload = { ...bookInfoRef.current, chapters, workspace: workspaceRef.current };
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

  // Auto-save workspace data (debounced)
  const workspaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceLoadedRef = useRef(false);

  useEffect(() => {
    if (!workspaceLoadedRef.current) { workspaceLoadedRef.current = true; return; }
    if (!projectLoadedRef.current) return;
    if (workspaceTimerRef.current) clearTimeout(workspaceTimerRef.current);
    workspaceTimerRef.current = setTimeout(() => {
      const payload = { ...bookInfoRef.current, chapters: chaptersRef.current, workspace: workspaceData };
      fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projectId, book_info: payload }) });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceData]);

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
    setSelection({ type: "section", chapterId: id, sectionId });
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

  // ─── Adapt to Another Language ─────────────────────────────

  function handleCreateAdaptedEdition(config: { targetLanguage: string; adaptationStyle: string; toneHandling: string }) {
    // Add the target language to book_info.target_languages if not already there
    const currentTargets = bookInfo.target_languages
      ? bookInfo.target_languages.split(",").map((l) => l.trim()).filter(Boolean)
      : [];
    if (!currentTargets.some((l) => l.toLowerCase() === config.targetLanguage.toLowerCase())) {
      const updated = [...currentTargets, config.targetLanguage].join(", ");
      const newBookInfo = { ...bookInfo, target_languages: updated };
      setBookInfo(newBookInfo);
      handleBookInfoChange(newBookInfo);
    }

    // TODO: Trigger AI adaptation pipeline here
    // This would:
    // 1. Gather all manuscript sections from the primary language
    // 2. Send to an AI adaptation API with config (targetLanguage, adaptationStyle, toneHandling)
    // 3. Create a new version record with language = config.targetLanguage
    // 4. Store the adapted sections
    // 5. Reload versions
    console.log("Create adapted edition:", config);

    setShowAdaptModal(false);
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
        <button className="flex items-center justify-center" onClick={() => setMobileSidebarOpen((v) => !v)} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }} aria-label="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
        </button>
        <span className="text-[20px] mobile-text-15 font-bold" style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {bookInfo.title || projectName || "Untitled Project"}
        </span>
        {bookInfo.genre && <span className="mobile-hidden text-[13px]" style={{ color: "var(--text-muted)" }}>{bookInfo.genre}</span>}
        <span className="mobile-hidden" style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: projectType === "Book" ? "rgba(74,222,128,0.18)" : projectType === "Music" ? "rgba(90,154,245,0.18)" : "rgba(251,191,36,0.18)", color: projectType === "Book" ? "#4ade80" : projectType === "Music" ? "#5a9af5" : "#fbbf24" }}>{projectType}</span>
        <div style={{ flex: 1 }} />
        <ThemeToggle />
        <button onClick={() => router.push("/")} className="text-[13px] font-medium transition-colors" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>Exit</button>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>
        {mobileSidebarOpen && <div className="desktop-hidden" style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileSidebarOpen(false)} />}

        {/* Left sidebar */}
        {(topTab === "Workspace" || topTab === "Book") && (
        <aside className={`shrink-0 border-r border-[var(--border-default)] overflow-y-auto ${mobileSidebarOpen ? "fixed inset-y-0 left-0" : "mobile-hidden"}`} style={{ width: 280, background: "var(--surface-1)", zIndex: 41, top: mobileSidebarOpen ? 56 : undefined }}>
          {/* Book | Workspace tabs (hidden on Publish) */}
          {!(topTab === "Book" && activeStage === "Publish") && (
          <div className="flex items-center gap-1 px-4 pt-4 pb-3 mx-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
            {TOP_TABS.map((tab) => (
              <button key={tab} onClick={() => setTopTab(tab)} className={`px-3 py-1.5 text-[13px] rounded transition-colors ${topTab === tab ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)]"}`} style={topTab === tab ? { borderBottom: "2px solid var(--accent-blue)" } : undefined}>{tab}</button>
            ))}
          </div>
          )}

          {/* Publish sidebar: Project Status panel */}
          {topTab === "Book" && activeStage === "Publish" && (
          <PublishSidebar chapters={chapters} composeTexts={composeTexts} bookVersions={bookVersions} bookInfo={bookInfo} selectedVersionId={selectedVersionId} onPreview={(vId) => router.push(`/projects/${projectId}/book/${vId}`)} onAdapt={() => setShowAdaptModal(true)} />
          )}

          {/* Book sidebar content */}
          {topTab === "Book" && activeStage === "Compose" && (
          <nav className="flex flex-col gap-0.5 text-[14px] px-4 pt-5 pb-4">
            <button onClick={() => setSelection({ type: "book_info" })} className={`w-full rounded px-2 py-1.5 text-left text-[14px] transition-colors ${selection.type === "book_info" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>Book Info</button>
            <button onClick={() => setSelection({ type: "prologue" })} className={`w-full rounded px-2 py-1.5 text-left text-[14px] transition-colors ${selection.type === "prologue" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>Prologue</button>
            <button onClick={() => setSelection({ type: "epilogue" })} className={`w-full rounded px-2 py-1.5 text-left text-[14px] transition-colors ${selection.type === "epilogue" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}>Epilogue</button>

            {/* Chapters */}
            <div className="mt-6 mb-1 flex items-center justify-between px-2">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Chapters</span>
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
                    <button onClick={() => setExpandedChapters((prev) => ({ ...prev, [ch.id]: !prev[ch.id] }))} className={`flex-1 rounded px-1 py-1.5 text-left min-w-0 transition-colors flex items-baseline ${isChapterActive || isChildActive ? "" : ""}`}>
                      <InlineTitle
                        value={ch.title}
                        onChange={(v) => handleRenameChapter(ch.id, v)}
                        autoFocus={autoFocusId === ch.id}
                        className="text-[14px] font-medium min-w-0"
                        style={{ color: isChapterActive || isChildActive ? "var(--text-primary)" : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto" }}
                      />
                      {ch.sections.length > 0 && (
                        <span className="shrink-0 text-[11px] ml-1" style={{ color: "var(--text-faint)" }}>({ch.sections.length})</span>
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
                            <button onClick={() => setSelection({ type: "section", chapterId: ch.id, sectionId: sec.id })} className={`flex-1 rounded px-2 py-1 text-left min-w-0 transition-colors ${isSectionActive ? "bg-[var(--overlay-active)]" : ""}`}>
                              <InlineTitle
                                value={sec.title}
                                onChange={(v) => handleRenameSection(ch.id, sec.id, v)}
                                autoFocus={autoFocusId === sec.id}
                                className="w-full text-[13px]"
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
                        <button onClick={() => handleAddSection(ch.id)} className="px-2 py-1 text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-blue)] transition-colors text-left">+ Add Section</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          </nav>
          )}

          {/* Manuscript TOC */}
          {topTab === "Book" && activeStage === "Manuscript" && (
          <nav className="flex flex-col gap-0.5 text-[13px] px-4 pt-5 pb-4">
            <div className="px-2 pb-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Table of Contents</span>
            </div>

            {/* Prologue */}
            {hasContent(composeTexts["prologue"] ?? "") && (
              <button
                onClick={() => document.getElementById("ms-prologue")?.scrollIntoView({ behavior: "smooth" })}
                className="w-full rounded px-2 py-1.5 text-left text-[14px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Prologue
              </button>
            )}

            {/* Chapters + sections */}
            {chapters.map((ch) => {
              const sectionsWithContent = ch.sections.filter((sec) => hasContent(composeTexts[sec.id] ?? ""));
              if (sectionsWithContent.length === 0) return null;
              const isExpanded = expandedChapters[ch.id] ?? true;
              return (
                <div key={ch.id}>
                  <div className="flex items-center">
                    <button
                      onClick={() => setExpandedChapters((prev) => ({ ...prev, [ch.id]: !prev[ch.id] }))}
                      className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                      style={{ width: 16, height: 16 }}
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                    </button>
                    <button
                      onClick={() => document.getElementById(`ms-ch-${ch.id}`)?.scrollIntoView({ behavior: "smooth" })}
                      className="flex-1 rounded px-1 py-1.5 text-left text-[14px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors min-w-0"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {ch.title}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                      {sectionsWithContent.map((sec) => (
                        <button
                          key={sec.id}
                          onClick={() => document.getElementById(`ms-sec-${sec.id}`)?.scrollIntoView({ behavior: "smooth" })}
                          className="w-full rounded px-2 py-1 text-left text-[13px] text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors min-w-0"
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {sec.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Epilogue */}
            {hasContent(composeTexts["epilogue"] ?? "") && (
              <button
                onClick={() => document.getElementById("ms-epilogue")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-1 w-full rounded px-2 py-1.5 text-left text-[14px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Epilogue
              </button>
            )}
          </nav>
          )}

          {/* Workspace sidebar content */}
          {topTab === "Workspace" && workspace.sidebarContent}
        </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {/* Book sub-navigation */}
          {topTab === "Book" && (
            <div className="flex shrink-0 gap-1 px-8 mobile-px-4" style={{ overflowX: "auto", paddingTop: 16, paddingBottom: 16 }}>
              {STAGES.map((stage) => (
                <button key={stage} onClick={() => setActiveStage(stage)} className={`px-3 py-1.5 text-[13px] rounded transition-colors ${activeStage === stage ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)]"}`} style={activeStage === stage ? { borderBottom: "2px solid var(--accent-blue)" } : undefined}>{stage}</button>
              ))}
            </div>
          )}
          {/* ─── Workspace Tab ─── */}
          {topTab === "Workspace" && workspace.mainContent}
          {topTab === "Book" && <div className="flex-1 min-h-0 overflow-hidden">
          {/* ─── COMPOSE ─── */}
          {activeStage === "Compose" && selection.type === "book_info" ? (
            <BookInfoPanel
              bookInfo={bookInfo}
              onChange={handleBookInfoChange}
              aiMessages={aiMessages["book_info"] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage("book_info", updated)}
              onAddAiMessage={(msg) => handleAddAiMessage("book_info", msg)}
              projectId={projectId}
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
                  <div id="ms-prologue" className="mb-10">
                    <h3 className="text-[16px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Prologue</h3>
                    <div className="prose-rendered" dangerouslySetInnerHTML={{ __html: cleanManuscriptHtml(composeTexts["prologue"] ?? "") }} />
                  </div>
                )}

                {/* Chapters with their sections */}
                {chapters.map((ch) => {
                  const sectionsWithContent = ch.sections.filter((sec) => hasContent(composeTexts[sec.id] ?? ""));
                  if (sectionsWithContent.length === 0) return null;
                  return (
                    <div key={ch.id} id={`ms-ch-${ch.id}`} className="mb-10">
                      <h3 className="text-[16px] font-semibold mb-5 pt-6" style={{ color: "var(--text-primary)", borderTop: "1px solid var(--border-default)" }}>{ch.title}</h3>
                      {sectionsWithContent.map((sec) => (
                        <div key={sec.id} id={`ms-sec-${sec.id}`} className="mb-6">
                          <h4 className="text-[13px] font-medium mb-3" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{sec.title}</h4>
                          <div className="prose-rendered" dangerouslySetInnerHTML={{ __html: cleanManuscriptHtml(composeTexts[sec.id] ?? "") }} />
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* Epilogue */}
                {hasContent(composeTexts["epilogue"] ?? "") && (
                  <div id="ms-epilogue" className="mb-10">
                    <h3 className="text-[16px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Epilogue</h3>
                    <div className="prose-rendered" dangerouslySetInnerHTML={{ __html: cleanManuscriptHtml(composeTexts["epilogue"] ?? "") }} />
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
              {(() => {
                const primaryLang = bookInfo.primary_language?.trim() || "English";
                const targetLangs = bookInfo.target_languages
                  ? bookInfo.target_languages.split(",").map((l) => l.trim()).filter(Boolean)
                  : [];
                const allLangs = [primaryLang, ...targetLangs.filter((l) => l.toLowerCase() !== primaryLang.toLowerCase())];

                // Group versions by language
                const versionsByLang: Record<string, typeof bookVersions> = {};
                for (const lang of allLangs) versionsByLang[lang] = [];
                for (const v of bookVersions) {
                  const vLang = (v as Record<string, unknown>).language as string | undefined;
                  const lang = vLang?.trim() || primaryLang;
                  if (!versionsByLang[lang]) versionsByLang[lang] = [];
                  versionsByLang[lang].push(v);
                }

                // Selected language (default to primary)
                const activeLang = publishLang || primaryLang;
                const isPrimary = activeLang.toLowerCase() === primaryLang.toLowerCase();
                const versions = versionsByLang[activeLang] ?? [];
                const editionLabel = isPrimary ? "Original" : versions.length > 0 ? "Adapted Edition" : "Not created yet";
                const editionColor = isPrimary ? "var(--accent-green)" : versions.length > 0 ? "var(--accent-blue)" : "var(--text-faint)";

                return (
                  <>
                    {/* Header with language selector */}
                    <div className="flex items-center justify-between mb-6 mobile-stack mobile-gap-2">
                      <div>
                        <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>Publish</h2>
                        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Manage editions and snapshots of your manuscript</p>
                      </div>
                      {allLangs.length > 1 && (
                        <div className="flex items-center gap-2">
                          <select
                            value={activeLang}
                            onChange={(e) => setPublishLang(e.target.value)}
                            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] outline-none cursor-pointer"
                            style={{ colorScheme: "dark" }}
                          >
                            {allLangs.map((l) => {
                              const lIsPrimary = l.toLowerCase() === primaryLang.toLowerCase();
                              const lVersions = versionsByLang[l] ?? [];
                              const suffix = lIsPrimary ? " (Original)" : lVersions.length > 0 ? ` (${lVersions.length})` : "";
                              return <option key={l} value={l}>{l}{suffix}</option>;
                            })}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Single edition card for selected language */}
                    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "auto" }}>
                      <div className="flex items-center gap-3" style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{activeLang}</span>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 8px", borderRadius: 20, background: isPrimary ? "rgba(74,222,128,0.12)" : versions.length > 0 ? "rgba(90,154,245,0.12)" : "var(--overlay-hover)", color: editionColor }}>{editionLabel}</span>
                        {versions.length > 0 && <span className="ml-auto text-[11px]" style={{ color: "var(--text-faint)" }}>{versions.length} version{versions.length !== 1 ? "s" : ""}</span>}
                      </div>

                      {versions.length === 0 ? (
                        <div style={{ padding: "28px 14px" }} className="text-center">
                          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
                            {isPrimary ? "No versions yet. Use \u201CSend to Publish\u201D from the Manuscript tab to create a snapshot." : "No edition created yet."}
                          </p>
                          {!isPrimary && (
                            <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>Language adaptation coming soon.</p>
                          )}
                        </div>
                      ) : (
                        <table className="w-full text-[13px]">
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <th className="pb-2 pl-3.5 pr-4 pt-2.5 text-center font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", width: 60 }}>Version</th>
                              <th className="pb-2 pr-4 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Title</th>
                              <th className="pb-2 pr-4 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Category</th>
                              <th className="pb-2 pr-4 pt-2.5 text-center font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Published</th>
                              <th className="pb-2 pr-4 pt-2.5 text-left font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Prep Date</th>
                              <th className="pb-2 pr-1 pt-2.5 text-center font-medium" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Status</th>
                              <th className="pb-2 pr-1 pt-2.5 font-medium w-10" style={{ fontSize: 11 }}></th>
                              <th className="pb-2 pr-3.5 pt-2.5 font-medium w-10" style={{ fontSize: 11 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {versions.map((v) => {
                              const ds = v.derived_status ?? v.status;
                              const statusLabel = ds === "finalized" ? "Finalized" : ds === "in_progress" ? "In Progress" : "Pending";
                              const statusColor = ds === "finalized" ? "text-green-400" : ds === "in_progress" ? "text-yellow-400" : "text-red-400/60";
                              const isSelected = selectedVersionId === v.id;
                              return (
                              <tr
                                key={v.id}
                                className="group cursor-pointer"
                                style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.12s", background: isSelected ? "var(--overlay-active)" : "transparent" }}
                                onClick={() => setSelectedVersionId(isSelected ? null : v.id)}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--overlay-hover)"; }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                              >
                                <td className="py-2.5 pl-3.5 pr-4 text-center font-medium text-[var(--text-primary)]">V{v.version_number}</td>
                                <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{bookInfo.title || "Untitled"}</td>
                                <td className="py-2.5 pr-4 text-[var(--text-tertiary)]">{bookInfo.genre || "—"}</td>
                                <td className="py-2.5 pr-4 text-center text-[var(--text-tertiary)]">{bookInfo.year_published || "—"}</td>
                                <td className="py-2.5 pr-4 text-[var(--text-tertiary)]">{new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                                <td className="py-2.5 pr-1 text-center"><span className={`text-lg ${statusColor}`} title={statusLabel}>&#9679;</span></td>
                                <td className="py-2.5 pr-1 w-10">
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/projects/${projectId}/book/${v.id}`); }} className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-tertiary)]" title="Final Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                  </button>
                                </td>
                                <td className="py-2.5 pr-3.5 w-10">
                                  <button onClick={(e) => { e.stopPropagation(); console.log("Print PDF - version:", v.id); }} className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-tertiary)]" title="Print PDF">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                                  </button>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4"><p className="text-[13px] text-[var(--text-faint)]">Select a tab above.</p></div>
          )}
          </div>}
        </div>
      </div>

      {/* Adapt Language Modal */}
      {showAdaptModal && (
        <AdaptLanguageModal
          onClose={() => setShowAdaptModal(false)}
          onCreate={handleCreateAdaptedEdition}
          primaryLanguage={bookInfo.primary_language?.trim() || "English"}
          existingLanguages={[
            bookInfo.primary_language?.trim() || "English",
            ...(bookInfo.target_languages ? bookInfo.target_languages.split(",").map((l) => l.trim()).filter(Boolean) : []),
          ]}
        />
      )}

      {/* Confirm remove chapter dialog */}
      {confirmRemoveChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Remove chapter?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">All sections, content, and AI conversations for this chapter will be permanently deleted.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmRemoveChapter(null)} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
              <button onClick={() => handleRemoveChapter(confirmRemoveChapter)} className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
