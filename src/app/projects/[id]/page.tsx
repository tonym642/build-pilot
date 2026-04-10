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

type SectionId = string;

function sectionLabel(s: SectionId): string {
  if (s === "book_info") return "Book Info";
  if (s === "prologue") return "Prologue";
  if (s === "epilogue") return "Epilogue";
  return s;
}

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

/* ─── Chapter section type ──────────────────────────────────── */

type ChapterSection = {
  id: string;
  name: string;
  title: string;
};

type ChapterData = {
  name: string;
  title: string;
  sections: ChapterSection[];
};

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
    <div className="overflow-y-auto h-full">
      <div className="px-8 py-8 mobile-px-4" style={{ maxWidth: 720 }}>
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
    // Mutual exclusion: like/dislike
    if (field === "is_liked" && updated.is_liked) updated.is_disliked = false;
    if (field === "is_disliked" && updated.is_disliked) updated.is_liked = false;
    onUpdate(updated);
  }

  const btnClass = "transition-colors";
  const activeColor = "var(--text-primary)";
  const inactiveColor = "var(--text-faint)";

  return (
    <div className="mt-2 flex items-center gap-3">
      {/* Copy */}
      <button
        title="Copy"
        className={btnClass}
        style={{ color: inactiveColor }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = inactiveColor)}
        onClick={() => navigator.clipboard.writeText(message.text)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>

      {/* Favorite */}
      <button
        title={message.is_favorite ? "Unfavorite" : "Favorite"}
        className={btnClass}
        style={{ color: message.is_favorite ? "#fbbf24" : inactiveColor }}
        onMouseEnter={(e) => { if (!message.is_favorite) e.currentTarget.style.color = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { if (!message.is_favorite) e.currentTarget.style.color = inactiveColor; }}
        onClick={() => toggle("is_favorite")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>

      {/* Like */}
      <button
        title={message.is_liked ? "Unlike" : "Like"}
        className={btnClass}
        style={{ color: message.is_liked ? activeColor : inactiveColor }}
        onMouseEnter={(e) => { if (!message.is_liked) e.currentTarget.style.color = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { if (!message.is_liked) e.currentTarget.style.color = inactiveColor; }}
        onClick={() => toggle("is_liked")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      </button>

      {/* Dislike */}
      <button
        title={message.is_disliked ? "Undo dislike" : "Dislike"}
        className={btnClass}
        style={{ color: message.is_disliked ? activeColor : inactiveColor }}
        onMouseEnter={(e) => { if (!message.is_disliked) e.currentTarget.style.color = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { if (!message.is_disliked) e.currentTarget.style.color = inactiveColor; }}
        onClick={() => toggle("is_disliked")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={message.is_disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
        </svg>
      </button>

      {/* Hide */}
      <button
        title={message.is_hidden ? "Unhide" : "Hide"}
        className={btnClass}
        style={{ color: message.is_hidden ? activeColor : inactiveColor }}
        onMouseEnter={(e) => { if (!message.is_hidden) e.currentTarget.style.color = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { if (!message.is_hidden) e.currentTarget.style.color = inactiveColor; }}
        onClick={() => toggle("is_hidden")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>

      {/* Trash */}
      <button
        title={message.is_deleted ? "Restore" : "Delete"}
        className={btnClass}
        style={{ color: message.is_deleted ? "#ef4444" : inactiveColor }}
        onMouseEnter={(e) => { if (!message.is_deleted) e.currentTarget.style.color = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { if (!message.is_deleted) e.currentTarget.style.color = inactiveColor; }}
        onClick={() => toggle("is_deleted")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      {/* Timestamp */}
      <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>
        {message.created_at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ─── AI Panel ──────────────────────────────────────────────── */

function AiPanel({
  messages,
  onUpdateMessage,
  projectId,
  bookTitle,
  chapter,
  onAddMessage,
}: {
  messages: AiMessage[];
  onUpdateMessage: (updated: AiMessage) => void;
  projectId: string;
  bookTitle: string;
  chapter: string;
  onAddMessage: (message: AiMessage) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AiFilter>("brainstorm");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    const trimmed = input.trim();
    const userMsg = newAiMessage(Date.now(), "user", trimmed);
    onAddMessage(userMsg);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, chapter, bookTitle, project_id: projectId }),
      });
      const data = await res.json();
      onAddMessage(
        newAiMessage(Date.now() + 1, "ai", res.ok && data.reply ? data.reply : "I couldn't generate a response right now. Please try again.")
      );
    } catch {
      onAddMessage(
        newAiMessage(Date.now() + 1, "ai", "I couldn't generate a response right now. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const filtered = filterMessages(messages, activeFilter);

  return (
    <div className="flex h-full flex-col">
      {/* Filter tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 pt-3 pb-2" style={{ overflowX: "auto" }}>
        {AI_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
              activeFilter === f.key
                ? "bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]"
                : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-5 pb-4">
          {filtered.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-[rgba(255,255,255,0.06)] px-4 py-2.5 text-[13px] text-[var(--text-secondary)] whitespace-pre-line">
                    {msg.text}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
                    {msg.text}
                  </p>
                  <AiActionBar message={msg} onUpdate={onUpdateMessage} />
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-[12px] text-[var(--text-faint)] text-center py-8">
              {activeFilter === "brainstorm" ? "Start a conversation with your AI assistant." : `No ${activeFilter} messages.`}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border-default)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 transition-colors focus-within:border-[rgba(90,154,245,0.35)] focus-within:bg-[rgba(255,255,255,0.05)]">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or share an idea…"
            rows={1}
            style={{ minHeight: "1.5rem", maxHeight: "12.5rem" }}
            className="flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none leading-relaxed"
          />
          {loading ? (
            <div className="mb-0.5 shrink-0 flex h-7 w-7 items-center justify-center">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-tertiary)]" />
            </div>
          ) : input.trim() ? (
            <button
              type="button"
              aria-label="Send"
              onClick={handleSubmit}
              className="mb-0.5 shrink-0 rounded-full bg-white p-1.5 text-black transition-opacity hover:opacity-80"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="13" x2="8" y2="3" /><polyline points="4,7 8,3 12,7" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Compose Page (split layout) ───────────────────────────── */

function ComposePage({
  chapter,
  composeText,
  onComposeChange,
  aiMessages,
  onUpdateAiMessage,
  onAddAiMessage,
  projectId,
  bookTitle,
  chapterTitle,
  onChapterTitleChange,
}: {
  chapter: string;
  composeText: string;
  onComposeChange: (text: string) => void;
  aiMessages: AiMessage[];
  onUpdateAiMessage: (updated: AiMessage) => void;
  onAddAiMessage: (message: AiMessage) => void;
  projectId: string;
  bookTitle: string;
  chapterTitle: string;
  onChapterTitleChange: (title: string) => void;
}) {
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [dividerX, setDividerX] = useState(50); // percentage of total width for left side
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;

    function handleMouseMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setDividerX(Math.max(25, Math.min(75, pct)));
    }

    function handleMouseUp() {
      dragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      {/* Left: text writing area */}
      <div
        className="flex flex-col min-h-0"
        style={{ width: aiPanelOpen ? `${dividerX}%` : "100%" }}
      >
        <div className="flex-1 min-h-0 px-6 pb-6">
          <RichTextEditor
            content={composeText}
            onChange={onComposeChange}
            label={sectionLabel(chapter)}
            titleValue={chapterTitle}
            onTitleChange={onChapterTitleChange}
            placeholder="Start writing…"
          />
        </div>
      </div>

      {/* Draggable divider */}
      {aiPanelOpen && (
        <div
          className="shrink-0 flex items-center justify-center"
          style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }}
          onMouseDown={handleMouseDown}
        >
          {/* Toggle button */}
          <button
            onClick={() => setAiPanelOpen(false)}
            title="Close AI panel"
            className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]"
            style={{ width: 22, height: 22, zIndex: 11 }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <polyline points="3,1 7,5 3,9" />
            </svg>
          </button>
        </div>
      )}

      {/* Toggle button when AI panel is closed */}
      {!aiPanelOpen && (
        <div className="shrink-0 flex items-center" style={{ position: "relative", width: 16 }}>
          <button
            onClick={() => setAiPanelOpen(true)}
            title="Open AI panel"
            className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]"
            style={{ width: 22, height: 22, right: -11, zIndex: 11 }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <polyline points="7,1 3,5 7,9" />
            </svg>
          </button>
        </div>
      )}

      {/* Right: AI assistant panel */}
      {aiPanelOpen && (
        <div
          className="min-h-0 flex flex-col pr-6 pb-6"
          style={{ width: `${100 - dividerX}%` }}
        >
          <div className="flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)]">
            <AiPanel
              messages={aiMessages}
              onUpdateMessage={onUpdateAiMessage}
              projectId={projectId}
              bookTitle={bookTitle}
              chapter={chapter}
              onAddMessage={onAddAiMessage}
            />
          </div>
        </div>
      )}
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
  const [activeSection, setActiveSection] = useState<SectionId>("Chapter 1");
  const [chapters, setChapters] = useState<ChapterData[]>([
    { name: "Chapter 1", title: "", sections: [] },
    { name: "Chapter 2", title: "", sections: [] },
    { name: "Chapter 3", title: "", sections: [] },
  ]);
  const [confirmRemoveChapter, setConfirmRemoveChapter] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Record<string, AiMessage[]>>({});
  const [composeTexts, setComposeTexts] = useState<Record<string, string>>({});
  const [bookInfo, setBookInfo] = useState<BookInfo>(EMPTY_BOOK_INFO);
  const [bookVersions, setBookVersions] = useState<{ id: string; version_number: number; source: string; status: string; created_at: string; derived_status?: string }[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  // Close mobile sidebar when section changes
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [activeSection, activeStage]);

  // Load project record
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
          }
        }
      });
  }, [projectId]);

  // Load persisted messages from Supabase
  useEffect(() => {
    if (!projectId) return;
    async function loadMessages() {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setMessagesLoaded(true);
        return;
      }

      const grouped: Record<string, typeof data> = {};
      for (const row of data) {
        const chapter = row.chapter_id ?? "Chapter 1";
        if (!grouped[chapter]) grouped[chapter] = [];
        grouped[chapter].push(row);
      }

      const newMessages: Record<string, AiMessage[]> = {};
      for (const [chapter, rows] of Object.entries(grouped)) {
        newMessages[chapter] = rows.map((row: Record<string, unknown>, i: number) =>
          newAiMessage(
            i + 1,
            (row.role === "assistant" ? "ai" : "user") as AiMessage["role"],
            row.message as string
          )
        );
      }

      setAiMessages((prev) => {
        const merged = { ...prev };
        for (const [chapter, msgs] of Object.entries(newMessages)) {
          if (!merged[chapter] || merged[chapter].length === 0) {
            merged[chapter] = msgs;
          }
        }
        return merged;
      });
      setMessagesLoaded(true);
    }
    loadMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load book versions
  useEffect(() => {
    if (!projectId) return;
    loadBookVersions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadBookVersions() {
    const res = await fetch(`/api/projects/${projectId}/versions`);
    const data = await res.json();
    if (Array.isArray(data)) setBookVersions(data);
  }

  // Save book info with debounce
  const bookInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBookInfoChange = useCallback((updated: BookInfo) => {
    setBookInfo(updated);
    // Sync project name from book title
    if (updated.title.trim()) {
      setProjectName(updated.title.trim());
    }
    if (bookInfoTimerRef.current) clearTimeout(bookInfoTimerRef.current);
    bookInfoTimerRef.current = setTimeout(() => {
      const patch: Record<string, unknown> = { id: projectId, book_info: updated };
      if (updated.title.trim()) patch.name = updated.title.trim();
      fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }, 800);
  }, [projectId]);

  // Auto-save compose texts (debounced)
  const composeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composeLoadedRef = useRef(false);

  useEffect(() => {
    if (!composeLoadedRef.current) {
      composeLoadedRef.current = true;
      return;
    }
    if (composeTimerRef.current) clearTimeout(composeTimerRef.current);
    composeTimerRef.current = setTimeout(() => {
      // Flatten compose texts into draft blocks for persistence
      const allBlocks: Record<string, unknown>[] = [];
      for (const [chapter, text] of Object.entries(composeTexts)) {
        if (hasContent(text)) {
          allBlocks.push({
            id: crypto.randomUUID(),
            chapter,
            content: text,
            previousContent: null,
            sourceCompilationId: null,
          });
        }
      }
      fetch(`/api/projects/${projectId}/drafts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: allBlocks }),
      });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeTexts]);

  // Load compose texts from drafts API on mount
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/drafts`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const texts: Record<string, string> = {};
          for (const row of data) {
            const chapter = row.chapter as string;
            // Combine blocks for the same chapter
            texts[chapter] = texts[chapter]
              ? texts[chapter] + "\n\n" + (row.content as string)
              : (row.content as string);
          }
          setComposeTexts(texts);
        }
      });
  }, [projectId]);

  function handleAddAiMessage(chapter: string, message: AiMessage) {
    setAiMessages((prev) => ({
      ...prev,
      [chapter]: [...(prev[chapter] ?? []), message],
    }));
  }

  function handleUpdateAiMessage(chapter: string, updated: AiMessage) {
    setAiMessages((prev) => ({
      ...prev,
      [chapter]: (prev[chapter] ?? []).map((m) => m.id === updated.id ? updated : m),
    }));
  }

  function handleComposeChange(chapter: string, text: string) {
    setComposeTexts((prev) => ({ ...prev, [chapter]: text }));
  }

  function handleAddChapter() {
    setChapters((prev) => {
      const next = prev.length + 1;
      return [...prev, { name: `Chapter ${next}`, title: "", sections: [] }];
    });
  }

  function handleAddSection(chapterName: string) {
    setChapters((prev) =>
      prev.map((ch) => {
        if (ch.name !== chapterName) return ch;
        const sectionNum = ch.sections.length + 1;
        return {
          ...ch,
          sections: [...ch.sections, { id: crypto.randomUUID(), name: `Section ${sectionNum}`, title: "" }],
        };
      })
    );
  }

  function handleRenameChapter(chapterName: string, newTitle: string) {
    setChapters((prev) =>
      prev.map((ch) => ch.name === chapterName ? { ...ch, title: newTitle } : ch)
    );
  }

  function handleRenameSection(chapterName: string, sectionId: string, newTitle: string) {
    setChapters((prev) =>
      prev.map((ch) => {
        if (ch.name !== chapterName) return ch;
        return {
          ...ch,
          sections: ch.sections.map((s) => s.id === sectionId ? { ...s, title: newTitle } : s),
        };
      })
    );
  }

  function toggleChapterExpanded(chapterName: string) {
    setExpandedChapters((prev) => ({ ...prev, [chapterName]: !prev[chapterName] }));
  }

  const [sendingToPublish, setSendingToPublish] = useState(false);
  const [sendToPublishSuccess, setSendToPublishSuccess] = useState(false);

  async function handleSendToPublish() {
    setSendingToPublish(true);
    setSendToPublishSuccess(false);

    const orderedSections = ["prologue", ...chapters.map((c) => c.name), "epilogue"];
    const sections: { section_type: string; section_title: string; position: number; content: string }[] = [];
    let position = 0;

    for (const s of orderedSections) {
      const text = composeTexts[s];
      if (text && hasContent(text)) {
        const type = s === "prologue" ? "prologue" : s === "epilogue" ? "epilogue" : "chapter";
        sections.push({
          section_type: type,
          section_title: sectionLabel(s),
          position: position++,
          content: text,
        });
      }
    }

    const res = await fetch(`/api/projects/${projectId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });

    if (res.ok) {
      setSendToPublishSuccess(true);
      await loadBookVersions();
      setTimeout(() => setSendToPublishSuccess(false), 3000);
    }
    setSendingToPublish(false);
  }

  function handleConfirmRemoveChapter(chapter: string) {
    const remaining = chapters.filter((c) => c.name !== chapter);
    setChapters(remaining);
    setAiMessages((prev) => { const n = { ...prev }; delete n[chapter]; return n; });
    setComposeTexts((prev) => { const n = { ...prev }; delete n[chapter]; return n; });
    setActiveSection((prev) => (prev === chapter ? (remaining[0]?.name ?? "prologue") : prev));
    setConfirmRemoveChapter(null);
  }

  const [isChaptersOpen, setIsChaptersOpen] = useState(true);

  // Render App mode for App projects
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
        {/* Hamburger menu */}
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
          {bookInfo.title || projectName || "Untitled Project"}
        </span>
        {bookInfo.genre && (
          <span className="mobile-hidden text-[13px]" style={{ color: "var(--text-muted)" }}>
            {bookInfo.genre}
          </span>
        )}
        <span
          className="mobile-hidden"
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 3,
            background: projectType === "App" ? "rgba(139,124,245,0.18)" : projectType === "Book" ? "rgba(74,222,128,0.18)" : projectType === "Music" ? "rgba(90,154,245,0.18)" : "rgba(251,191,36,0.18)",
            color: projectType === "App" ? "#8b7cf5" : projectType === "Book" ? "#4ade80" : projectType === "Music" ? "#5a9af5" : "#fbbf24",
          }}
        >
          {projectType}
        </span>
        <div style={{ flex: 1 }} />
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

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="desktop-hidden"
            style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }}
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Left sidebar */}
        {activeStage !== "Publish" && (
        <aside
          className={`shrink-0 border-r border-[var(--border-default)] px-4 py-4 overflow-y-auto ${mobileSidebarOpen ? "" : "mobile-hidden"}`}
          style={{ width: 280, background: "var(--surface-1)", zIndex: 41 }}
        >
          <nav className="flex flex-col gap-1 text-[13px]">
            {/* Book Info */}
            <button
              onClick={() => setActiveSection("book_info")}
              className={[
                "w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors",
                activeSection === "book_info" ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              ].join(" ")}
            >
              Book Info
            </button>

            {/* Prologue */}
            <button
              onClick={() => setActiveSection("prologue")}
              className={[
                "w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors",
                activeSection === "prologue" ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              ].join(" ")}
            >
              Prologue
            </button>

            {/* Chapters — collapsible group with nested sections */}
            <div className="mt-1">
              <div className="flex w-full items-center justify-between px-2 py-1">
                <button
                  onClick={() => setIsChaptersOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs uppercase tracking-widest text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                >
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-150 ${isChaptersOpen ? "rotate-90" : ""}`}
                  >
                    <polyline points="3,1 7,5 3,9" />
                  </svg>
                  <span>Chapters</span>
                </button>
                <button
                  onClick={handleAddChapter}
                  title="Add chapter"
                  className="text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
                  </svg>
                </button>
              </div>
              {isChaptersOpen && (
                <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                  {chapters.map((ch) => {
                    const isExpanded = expandedChapters[ch.name] ?? false;
                    return (
                      <div key={ch.name}>
                        <div className="group flex items-center">
                          {/* Expand/collapse toggle for sections */}
                          <button
                            onClick={() => toggleChapterExpanded(ch.name)}
                            className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                            style={{ width: 14, height: 14 }}
                          >
                            {ch.sections.length > 0 && (
                              <svg
                                width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                                className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                              >
                                <polyline points="3,1 7,5 3,9" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => setActiveSection(ch.name)}
                            className={[
                              "flex-1 rounded-l px-1 py-1.5 text-left transition-colors min-w-0",
                              activeSection === ch.name ? "bg-[rgba(255,255,255,0.06)]" : "hover:text-[var(--text-secondary)]",
                            ].join(" ")}
                          >
                            <div className="flex items-baseline gap-1.5 min-w-0" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <span className="text-[13px] shrink-0" style={{ color: activeSection === ch.name ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                {ch.name}
                              </span>
                              {ch.title && (
                                <span className="text-[11px] min-w-0" style={{ color: activeSection === ch.name ? "var(--text-secondary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ch.title}
                                </span>
                              )}
                            </div>
                          </button>
                          {/* Add section button */}
                          <button
                            onClick={() => {
                              handleAddSection(ch.name);
                              setExpandedChapters((prev) => ({ ...prev, [ch.name]: true }));
                            }}
                            title="Add section"
                            className="pr-0.5 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all"
                          >
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmRemoveChapter(ch.name)}
                            title={`Remove ${ch.name}`}
                            className="pr-1 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
                            </svg>
                          </button>
                        </div>
                        {/* Nested sections */}
                        {isExpanded && ch.sections.length > 0 && (
                          <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                            {ch.sections.map((sec) => (
                              <button
                                key={sec.id}
                                onClick={() => setActiveSection(`${ch.name}::${sec.name}`)}
                                className={[
                                  "w-full rounded px-2 py-1 text-left transition-colors min-w-0",
                                  activeSection === `${ch.name}::${sec.name}` ? "bg-[rgba(255,255,255,0.06)]" : "",
                                ].join(" ")}
                              >
                                <div className="flex items-baseline gap-1.5 min-w-0" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <span className="text-[12px] shrink-0" style={{ color: activeSection === `${ch.name}::${sec.name}` ? "var(--text-primary)" : "var(--text-faint)" }}>
                                    {sec.name}
                                  </span>
                                  {sec.title && (
                                    <span className="text-[10px] min-w-0" style={{ color: activeSection === `${ch.name}::${sec.name}` ? "var(--text-tertiary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {sec.title}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Epilogue */}
            <button
              onClick={() => setActiveSection("epilogue")}
              className={[
                "mt-1 w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors",
                activeSection === "epilogue" ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              ].join(" ")}
            >
              Epilogue
            </button>
          </nav>
        </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {/* Stage navigation */}
          <div className="flex shrink-0 gap-1 px-8 mobile-px-4" style={{ overflowX: "auto", paddingTop: 20, paddingBottom: 20 }}>
            {STAGES.map((stage) => (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={[
                  "px-3 py-1.5 text-[13px] rounded transition-colors",
                  activeStage === stage
                    ? "font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-tertiary)]",
                ].join(" ")}
                style={activeStage === stage ? { borderBottom: "2px solid var(--accent-blue)" } : undefined}
              >
                {stage}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
          {activeSection === "book_info" && activeStage === "Compose" ? (
            <BookInfoPanel bookInfo={bookInfo} onChange={handleBookInfoChange} />
          ) : activeStage === "Compose" ? (
            <ComposePage
              chapter={activeSection}
              composeText={composeTexts[activeSection] ?? ""}
              onComposeChange={(text) => handleComposeChange(activeSection, text)}
              aiMessages={aiMessages[activeSection] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage(activeSection, updated)}
              onAddAiMessage={(msg) => handleAddAiMessage(activeSection, msg)}
              projectId={projectId}
              bookTitle={bookInfo.title || projectName || "this book"}
              chapterTitle={(() => {
                if (activeSection.includes("::")) {
                  const [chName, secName] = activeSection.split("::");
                  const ch = chapters.find((c) => c.name === chName);
                  return ch?.sections.find((s) => s.name === secName)?.title ?? "";
                }
                return chapters.find((c) => c.name === activeSection)?.title ?? "";
              })()}
              onChapterTitleChange={(title) => {
                if (activeSection.includes("::")) {
                  const [chName, secName] = activeSection.split("::");
                  const ch = chapters.find((c) => c.name === chName);
                  const sec = ch?.sections.find((s) => s.name === secName);
                  if (sec) handleRenameSection(chName, sec.id, title);
                } else {
                  handleRenameChapter(activeSection, title);
                }
              }}
            />
          ) : activeStage === "Manuscript" ? (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4">
              <div className="mx-auto" style={{ maxWidth: 900 }}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>Manuscript</h2>
                  <div className="flex items-center gap-3">
                    {sendToPublishSuccess && (
                      <span className="text-[13px] text-green-400">Snapshot saved!</span>
                    )}
                    <button
                      onClick={handleSendToPublish}
                      disabled={sendingToPublish}
                      className="text-[13px] font-medium transition-all disabled:opacity-40"
                      style={{
                        height: 36,
                        padding: "0 20px",
                        borderRadius: 20,
                        border: "none",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7, #ec4899)",
                        color: "#fff",
                        cursor: sendingToPublish ? "not-allowed" : "pointer",
                      }}
                    >
                      {sendingToPublish ? "Saving..." : "Send to Publish"}
                    </button>
                  </div>
                </div>
                {(["prologue", ...chapters.map((c) => c.name), "epilogue"])
                  .filter((s) => hasContent(composeTexts[s] ?? ""))
                  .map((s) => (
                      <div key={s} id={`manuscript-section-${s}`} className="mb-6" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                            {sectionLabel(s)}
                          </span>
                        </div>
                        <div style={{ padding: "16px 20px" }}>
                          <div
                            className="prose-rendered"
                            dangerouslySetInnerHTML={{ __html: composeTexts[s] ?? "" }}
                          />
                        </div>
                      </div>
                  ))
                }
                {(["prologue", ...chapters.map((c) => c.name), "epilogue"]).every((s) => !hasContent(composeTexts[s] ?? "")) && (
                  <p className="text-[13px] text-[var(--text-faint)]">
                    Your manuscript will appear here once you add content in Compose.
                  </p>
                )}
              </div>
            </div>
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
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                    All Versions
                  </span>
                </div>
                {bookVersions.length === 0 ? (
                  <div style={{ padding: "32px 14px" }}>
                    <p className="text-[13px] text-[var(--text-faint)]">
                      No versions yet. Use &ldquo;Send to Publish&rdquo; from the Manuscript tab to create a snapshot.
                    </p>
                  </div>
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
                        <tr
                          key={v.id}
                          className="group"
                          style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.12s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td className="py-2.5 pl-3.5 pr-1 w-10">
                            <button
                              onClick={() => router.push(`/projects/${projectId}/book/${v.id}`)}
                              className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]"
                              title="Final Edit"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </td>
                          <td className="py-2.5 pr-1 w-10">
                            <button
                              onClick={() => console.log("Print PDF - version:", v.id)}
                              className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-tertiary)]"
                              title="Print PDF"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                              </svg>
                            </button>
                          </td>
                          <td className="py-2.5 pr-6 font-medium text-[var(--text-primary)]">
                            Version {v.version_number}
                          </td>
                          <td className="py-2.5 pr-6 text-[var(--text-tertiary)]">
                            {new Date(v.created_at).toLocaleString("en-US", {
                              month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2.5 pr-6 text-[var(--text-tertiary)] capitalize">
                            {v.source} snapshot
                          </td>
                          <td className="py-2.5 pr-3.5">
                            <span className={`text-lg ${statusColor}`} title={statusLabel}>&#9679;</span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4">
              <p className="text-[13px] text-[var(--text-faint)]">Select a tab above.</p>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Confirm remove chapter dialog */}
      {confirmRemoveChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Remove {confirmRemoveChapter}?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">
              All content and AI conversations for this chapter will be permanently deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemoveChapter(null)}
                className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmRemoveChapter(confirmRemoveChapter)}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
