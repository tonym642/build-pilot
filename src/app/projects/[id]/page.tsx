"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppMode from "./app-mode";
import { useWorkspace, EMPTY_WORKSPACE, type WorkspaceData } from "./workspace";
import { useMainSidebar } from "@/components/layout/sidebar-context";
import { RichTextEditor, ToolbarButton, ColorPicker, RichTextToolbarButtons, type Editor } from "@/components/editor/rich-text-editor";
import { ThemeToggle } from "@/components/layout/theme-context";
import { AiMarkdown } from "@/components/ui/ai-markdown";
import { useModes, type ModeKey } from "@/components/layout/modes-context";
import {
  loadAIEngineConfig,
  resolveProjectContext,
  resolveWorkContext,
  type StageKey as AiStageKey,
  type ProjectContext,
  type WorkContext as AiWorkContext,
  type ChatHistoryEntry,
} from "@/lib/ai-engine";

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
    .replace(/<span\s+style="[^"]*">([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<span\s*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/\s+style="[^"]*"/gi, "")
    .replace(/<p>\s*[-–—]{2,}\s*<\/p>/gi, "")
    .replace(/<p>\s*---\s*<\/p>/gi, "");
}
type Stage = (typeof STAGES)[number];

/**
 * Parse an AI response into chapters and sections.
 * Supports formats:
 *   Chapter 1: Title        Chapter 1 - Title        1. Title
 *   - Section 1             * Section 1               - Section 1
 *   - Section 2             * Section 2               - Section 2
 */
/** Format chapter label for sidebar: "Chapter 1: Planet Kora" -> "01- Planet Kora" */
function formatChapterLabel(title: string, index: number): string {
  const num = String(index + 1).padStart(2, "0");
  // Strip "Chapter N: " or "Chapter N - " prefix if present
  const cleaned = title.replace(/^chapter\s+\d+\s*[:.–\-]\s*/i, "").trim();
  return `${num}- ${cleaned || title}`;
}

function parseChapterStructure(text: string): { title: string; sections: string[] }[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const chapters: { title: string; sections: string[] }[] = [];
  let current: { title: string; sections: string[] } | null = null;
  let inKeyBeats = false;

  // Stop markers — anything after these is not chapter data
  const stopPattern = /^(next\s+step|options:?\s*$|note:\s)/i;

  for (const line of lines) {
    // Stop parsing if we hit non-chapter content
    if (stopPattern.test(line)) break;

    // Skip dividers
    if (/^-{3,}$/.test(line)) continue;

    // Match chapter headers — requires explicit "Chapter" keyword or emoji prefix
    const cleaned = line.replace(/^[#*\s🎬]+/, "").replace(/\*+$/g, "").trim();
    const chapterMatch = cleaned.match(/^chapter\s+(\d+)\s*[:.–\-]\s*(.+)/i);
    if (chapterMatch) {
      const num = chapterMatch[1];
      const title = chapterMatch[2].replace(/\*+/g, "").trim();
      if (title) {
        current = { title: `Chapter ${num}: ${title}`, sections: [] };
        chapters.push(current);
        inKeyBeats = false;
        continue;
      }
    }

    if (!current) continue;

    // Detect sub-headers like "**🔹 Key Beats**" — skip label lines
    const subHeader = line.replace(/^[\*#🔹\s]+/, "").replace(/\*+$/g, "").trim().toLowerCase();
    if (/^(purpose|key beats|emotional|conflict|cinematic|tone|setting)/i.test(subHeader)) {
      continue;
    }

    // Match any bullet point as a section
    const sectionMatch = line.match(/^[\-\*•]\s*(.+)/);
    if (sectionMatch) {
      const sectionTitle = sectionMatch[1].replace(/\*+/g, "").trim();
      if (sectionTitle) current.sections.push(sectionTitle);
      continue;
    }

    // Also match numbered items like "1. Title" or "1) Title"
    const numberedMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (numberedMatch) {
      const sectionTitle = numberedMatch[1].replace(/\*+/g, "").trim();
      if (sectionTitle) current.sections.push(sectionTitle);
    }
  }

  // Ensure each chapter has at least one section
  for (const ch of chapters) {
    if (ch.sections.length === 0) ch.sections.push("Introduction");
  }

  console.log("CHAPTERS PARSED:", chapters.map((c) => `${c.title} (${c.sections.length} sections)`));
  return chapters;
}

/* ─── AI message with metadata ──────────────────────────────── */

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

function newAiMessage(id: number, role: "user" | "ai", text: string, db_id?: string | null): AiMessage {
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

type SectionStatus = "draft" | "in_progress" | "completed" | "finalized";

type ComposeStatus = "unstarted" | "started" | "completed";

const COMPOSE_STATUS_META: Record<ComposeStatus, { label: string; color: string }> = {
  unstarted: { label: "Unstarted", color: "#9ca3af" },
  started: { label: "Started", color: "#eab308" },
  completed: { label: "Completed", color: "#22c55e" },
};

function StatusBubble({ status }: { status: ComposeStatus }) {
  return (
    <span
      className="shrink-0 inline-block rounded-full"
      style={{ width: 8, height: 8, background: COMPOSE_STATUS_META[status].color }}
      aria-label={COMPOSE_STATUS_META[status].label}
    />
  );
}

type SectionData = {
  id: string;
  number?: number;
  title: string;
  summary?: string;
  status?: SectionStatus;
};

type ChapterData = {
  id: string;
  number?: number;
  title: string;
  summary?: string;
  status?: SectionStatus;
  sections: SectionData[];
};

/* ─── Selection state: what's active in the sidebar ─────────── */
type ActiveSelection =
  | { type: "structuring" }
  | { type: "book_info" }
  | { type: "characters" }
  | { type: "storyline" }
  | { type: "synopsis" }
  | { type: "prologue" }
  | { type: "prologue_section"; sectionId: string }
  | { type: "epilogue" }
  | { type: "epilogue_section"; sectionId: string }
  | { type: "chapter"; chapterId: string }
  | { type: "section"; chapterId: string; sectionId: string };

function selectionKey(sel: ActiveSelection): string {
  if (sel.type === "section") return `section::${sel.sectionId}`;
  if (sel.type === "chapter") return `chapter::${sel.chapterId}`;
  if (sel.type === "prologue_section") return `prologue_section::${sel.sectionId}`;
  if (sel.type === "epilogue_section") return `epilogue_section::${sel.sectionId}`;
  return sel.type;
}

/* ─── BookInfo ──────────────────────────────────────────────── */

type CharacterData = {
  id: string;
  name: string;
  description: string;
  hidden?: boolean;
};

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
  storyline: string;
  synopsis: string;
  synopsis_approved: boolean;
  characters: string[];
  characters_list?: CharacterData[];
  themes: string[];
  notes: string;
  prologue_sections: SectionData[];
  epilogue_sections: SectionData[];
  prologue_main_title?: string;
  epilogue_main_title?: string;
  section_statuses?: Record<string, ComposeStatus>;
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
  storyline: "",
  synopsis: "",
  synopsis_approved: false,
  prologue_sections: [],
  epilogue_sections: [],
  characters: [],
  characters_list: [],
  themes: [],
  notes: "",
};

/* ─── Shared props for info-style pages with right panel ──── */

type InfoPageProps = {
  bookInfo: BookInfo;
  onChange: (updated: BookInfo) => void;
  aiMessages: AiMessage[];
  onUpdateAiMessage: (updated: AiMessage) => void;
  onAddAiMessage: (message: AiMessage) => void;
  projectId: string;
  bookTitle: string;
  aiChannel: string;
  mode?: string;
  stage?: string;
  projectCtx?: ProjectContext;
  workCtx?: AiWorkContext;
  onSendToSynopsis?: (text: string) => void;
  onGenerateChapters?: (text: string) => void;
  children: React.ReactNode;
};

/* ─── InfoPageShell — shared split layout for Book Info / Storyline / Synopsis */

function InfoPageShell({
  aiMessages, onUpdateAiMessage, onAddAiMessage, projectId, bookTitle, aiChannel,
  mode, stage, projectCtx, workCtx, onSendToSynopsis, onGenerateChapters, children,
}: InfoPageProps) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"ai" | "notes">("ai");
  const [aiFilter, setAiFilter] = useState<AiFilter>("brainstorm");
  const [mobileComposeTab, setMobileComposeTab] = useState<"content" | "assistant">("content");
  const [dividerX, setDividerX] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notes
  const [notesContent, setNotesContent] = useState("");
  const notesSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionIdRef = useRef(aiChannel);
  sectionIdRef.current = aiChannel;
  const notesServerContent = useRef("");

  useEffect(() => {
    if (notesSaveRef.current) { clearTimeout(notesSaveRef.current); notesSaveRef.current = null; }
    if (!projectId || !aiChannel) return;
    fetch(`/api/projects/${projectId}/notes?section_id=${encodeURIComponent(aiChannel)}`)
      .then((res) => res.json())
      .then((data) => {
        const content = Array.isArray(data) ? (data[0]?.content ?? "") : (data?.content ?? "");
        notesServerContent.current = content;
        setNotesContent(content);
      })
      .catch(() => { notesServerContent.current = ""; setNotesContent(""); });
  }, [projectId, aiChannel]);

  function handleNotesChange(html: string) {
    setNotesContent(html);
    if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
    const sid = sectionIdRef.current;
    notesSaveRef.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sid, content: html }),
      });
    }, 800);
  }

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

  const isNotes = rightTab === "notes";
  function tabStyle(active: boolean): React.CSSProperties {
    return active
      ? { border: "1px solid var(--border-subtle)", borderBottom: "2px solid var(--accent-blue)", borderRadius: "6px 6px 0 0", background: "var(--overlay-hover)", marginBottom: -1 }
      : { border: "1px solid transparent", borderBottom: "2px solid transparent", borderRadius: "6px 6px 0 0", marginBottom: -1 };
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      {/* Mobile tab switcher */}
      <div className="desktop-hidden shrink-0 flex" style={{ borderBottom: "1px solid var(--border-default)" }}>
        {([["content", "Content"], ["assistant", "AI Assistant"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setMobileComposeTab(key); if (key === "assistant") setRightPanelOpen(true); }}
            className="flex-1 py-2 text-[13px] font-medium transition-colors"
            style={{
              color: mobileComposeTab === key ? "var(--text-primary)" : "var(--text-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottomWidth: 2,
              borderBottomStyle: "solid",
              borderBottomColor: mobileComposeTab === key ? "var(--accent-blue, #5a9af5)" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: page content */}
        <div className={`flex flex-col min-h-0 overflow-y-auto mobile-panel-full${mobileComposeTab !== "content" ? " mobile-hidden" : ""}`} style={{ width: rightPanelOpen ? `${dividerX}%` : "100%", cursor: "default" }}>
          {children}
        </div>

        {/* Divider — desktop only */}
        {rightPanelOpen && (
          <div className="shrink-0 flex items-center justify-center mobile-hidden" style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }} onMouseDown={handleMouseDown}>
            <button onClick={() => setRightPanelOpen(false)} title="Close panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, zIndex: 11 }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="3,1 7,5 3,9" /></svg>
            </button>
          </div>
        )}
        {!rightPanelOpen && (
          <div className="shrink-0 flex items-center mobile-hidden" style={{ position: "relative", width: 16 }}>
            <button onClick={() => setRightPanelOpen(true)} title="Open panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, right: -11, zIndex: 11 }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="7,1 3,5 7,9" /></svg>
            </button>
          </div>
        )}

        {/* Right panel */}
        {rightPanelOpen && (
          <div className={`min-h-0 flex flex-col pr-6 pt-6 pb-6 mobile-px-4 mobile-panel-full${mobileComposeTab !== "assistant" ? " mobile-hidden" : ""}`} style={{ width: `${100 - dividerX}%` }}>
            <div
              className="flex-1 min-h-0 flex flex-col rounded-md border border-[var(--border-default)] overflow-hidden"
              style={{ minHeight: 300, background: isNotes ? "var(--surface-notes)" : "var(--overlay-card)", transition: "background 0.2s ease", cursor: "default" }}
            >
              <div className="shrink-0 flex items-end px-3" style={{ paddingTop: 8, borderBottom: "1px solid var(--border-default)" }}>
                <button onClick={() => setRightTab("ai")} className={`px-3 py-1.5 text-[13px] transition-colors ${rightTab === "ai" ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`} style={tabStyle(rightTab === "ai")}>AI Assistant</button>
                <button onClick={() => setRightTab("notes")} className={`px-3 py-1.5 text-[13px] transition-colors ${rightTab === "notes" ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`} style={tabStyle(rightTab === "notes")}>Notepad</button>
                <div style={{ flex: 1 }} />
                {!isNotes && (
                  <div className="flex items-center gap-1 pb-1.5">
                    {AI_FILTERS.map((f) => (
                      <button key={f.key} onClick={() => setAiFilter(f.key)} className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${aiFilter === f.key ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0" style={{ display: rightTab === "ai" ? "flex" : "none", flexDirection: "column" }}>
                <AiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} projectId={projectId} bookTitle={bookTitle} chapter={aiChannel} onAddMessage={onAddAiMessage} mode={mode} stage={stage} projectContext={projectCtx} workContext={workCtx} hideHeader activeFilter={aiFilter} onFilterChange={setAiFilter} onSendToSynopsis={onSendToSynopsis} onGenerateChapters={onGenerateChapters} />
              </div>
              <div className="flex-1 min-h-0 notepad-tight" style={{ display: rightTab === "notes" ? "flex" : "none", flexDirection: "column" }}>
                <RichTextEditor content={notesContent} onChange={handleNotesChange} placeholder="Capture ideas, references, or thoughts…" borderless hideToolbar />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── BookInfoPage ─────────────────────────────────────────── */

function BookInfoPage(props: Omit<InfoPageProps, "children" | "aiChannel" | "bookTitle">) {
  const { bookInfo, onChange } = props;
  type BookInfoStringKey = { [K in keyof BookInfo]: BookInfo[K] extends string ? K : never }[keyof BookInfo];
  const fields: { key: BookInfoStringKey; label: string; multiline?: boolean; placeholder?: string }[] = [
    { key: "title", label: "Title", placeholder: "e.g. Life Basics 101" },
    { key: "subtitle", label: "Subtitle", placeholder: "e.g. A guide to living intentionally" },
    { key: "author", label: "Author", placeholder: "e.g. Tony Medina" },
    { key: "genre", label: "Genre", placeholder: "e.g. Self-help, Memoir, Fiction" },
    { key: "tone", label: "Tone", multiline: true, placeholder: "e.g. Warm, direct, conversational" },
    { key: "year_published", label: "Year Published", placeholder: "e.g. 2026" },
    { key: "one_line_hook", label: "One-Line Hook", multiline: true, placeholder: "A single sentence that captures the essence of the book" },
    { key: "audience", label: "Audience", multiline: true, placeholder: "Who is this book for?" },
    { key: "promise", label: "Promise", multiline: true, placeholder: "What will readers gain or feel by the end?" },
  ];

  return (
    <InfoPageShell {...props} aiChannel="book_info" bookTitle={bookInfo.title || "this book"}>
      <div className="p-6 mobile-p-3">
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
        <div className="flex items-end px-4" style={{ paddingTop: 8, borderBottom: "1px solid var(--border-default)" }}>
          <span className="px-2 py-1.5 text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Book Info</span>
          <span className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>Project metadata — not included in the manuscript</span>
        </div>
        <div className="px-6 py-6 mobile-px-4 flex flex-col gap-5">
          {fields.map(({ key, label, multiline, placeholder }) => (
            <div key={key} className="flex gap-6 mobile-stack" style={{ alignItems: multiline ? "flex-start" : "center" }}>
              <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: multiline ? 10 : 0, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                {label}
              </label>
              <div className="flex-1">
                {multiline ? (
                  <textarea
                    rows={1}
                    value={bookInfo[key]}
                    onChange={(e) => { onChange({ ...bookInfo, [key]: e.target.value }); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    ref={(el) => { if (el && bookInfo[key]) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
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
          <div className="flex gap-6 mobile-stack" style={{ alignItems: "flex-start" }}>
            <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: 10, letterSpacing: "0.06em", color: "var(--text-muted)" }}>Primary Language</label>
            <div className="flex-1">
              <select value={bookInfo.primary_language} onChange={(e) => onChange({ ...bookInfo, primary_language: e.target.value })} className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-secondary)] outline-none cursor-pointer focus:border-[rgba(90,154,245,0.35)] transition-colors" style={{ colorScheme: "dark" }}>
                <option value="">Select language...</option>
                {BOOK_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>The language your original manuscript is written in.</p>
            </div>
          </div>
          <div className="flex gap-6 mobile-stack" style={{ alignItems: "flex-start" }}>
            <label className="shrink-0 text-[11px] font-semibold uppercase" style={{ width: 130, paddingTop: 10, letterSpacing: "0.06em", color: "var(--text-muted)" }}>Target Languages</label>
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
                    <select value="" onChange={(e) => { addLang(e.target.value); e.target.value = ""; }} className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-secondary)] outline-none cursor-pointer focus:border-[rgba(90,154,245,0.35)] transition-colors" style={{ colorScheme: "dark" }}>
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
    </InfoPageShell>
  );
}

/* ─── StorylinePage ────────────────────────────────────────── */

function StorylinePage(props: Omit<InfoPageProps, "children" | "aiChannel" | "bookTitle">) {
  const { bookInfo, onChange } = props;
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <InfoPageShell {...props} aiChannel="storyline" bookTitle={bookInfo.title || "this book"}>
      <div className="flex flex-col h-full p-6 mobile-p-3">
      <div className="flex flex-col flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
        <div className="shrink-0 flex items-center px-4" style={{ paddingTop: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-default)" }}>
          <span className="px-2 py-1.5 text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Storyline</span>
          <span className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>Narrative arc, turning points, and resolution</span>
          <div style={{ flex: 1 }} />
          {editor && <RichTextToolbarButtons editor={editor} />}
        </div>
        <div className="flex-1 min-h-0 notepad-tight">
          <RichTextEditor
            content={bookInfo.storyline}
            onChange={(html) => onChange({ ...bookInfo, storyline: html })}
            placeholder="Describe the narrative arc — the inciting incident, rising action, key turning points, climax, and resolution. Think of this as the backbone your chapters hang on…"
            borderless
            hideToolbar
            onEditor={setEditor}
          />
        </div>
      </div>
      </div>
    </InfoPageShell>
  );
}

/* ─── SynopsisPage ─────────────────────────────────────────── */

function SynopsisPage(props: Omit<InfoPageProps, "children" | "aiChannel" | "bookTitle">) {
  const { bookInfo, onChange } = props;
  return (
    <InfoPageShell {...props} aiChannel="synopsis" bookTitle={bookInfo.title || "this book"}>
      <div className="flex flex-col h-full p-6 mobile-p-3">
      <div className="flex flex-col flex-1 min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)]">
        <div className="shrink-0 flex items-end px-4" style={{ paddingTop: 8, borderBottom: "1px solid var(--border-default)" }}>
          <span className="px-2 py-1.5 text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Synopsis</span>
          <span className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>Narrative, structure, and key themes</span>
        </div>
        <div className="flex-1 min-h-0 notepad-tight">
          <RichTextEditor
            content={bookInfo.synopsis}
            onChange={(html) => onChange({ ...bookInfo, synopsis: html, synopsis_approved: false })}
            placeholder="Write your book synopsis here — describe the narrative arc, main themes, character journeys, and how the story unfolds from beginning to end…"
            borderless
            hideToolbar
          />
        </div>
        {/* Synopsis approval */}
        <div className="shrink-0 px-6 pb-4 flex items-center gap-2" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <button
            onClick={() => onChange({ ...bookInfo, synopsis_approved: !bookInfo.synopsis_approved })}
            disabled={!bookInfo.synopsis?.trim()}
            className="flex items-center gap-2 transition-colors"
            style={{ background: "none", border: "none", cursor: bookInfo.synopsis?.trim() ? "pointer" : "default", padding: 0 }}
          >
            <span className="flex items-center justify-center shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: bookInfo.synopsis_approved ? "1.5px solid var(--accent-green)" : "1.5px solid var(--border-hover)", background: bookInfo.synopsis_approved ? "rgba(74,222,128,0.12)" : "transparent" }}>
              {bookInfo.synopsis_approved && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2.5" /></svg>
              )}
            </span>
            <span className="text-[11px] font-medium" style={{ color: bookInfo.synopsis_approved ? "var(--accent-green)" : "var(--text-muted)" }}>
              {bookInfo.synopsis_approved ? "Synopsis Approved" : "Approve Synopsis"}
            </span>
          </button>
          {!bookInfo.synopsis_approved && bookInfo.synopsis?.trim() && (
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Required before generating chapters</span>
          )}
        </div>
      </div>
      </div>
    </InfoPageShell>
  );
}

/* ─── CharactersPage ───────────────────────────────────────── */

function CharactersPage(props: Omit<InfoPageProps, "children" | "aiChannel" | "bookTitle">) {
  const { bookInfo, onChange } = props;
  const characters = bookInfo.characters_list ?? [];
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function updateChar(id: string, patch: Partial<CharacterData>) {
    onChange({ ...bookInfo, characters_list: characters.map((c) => c.id === id ? { ...c, ...patch } : c) });
  }
  function addChar() {
    const newChar: CharacterData = { id: crypto.randomUUID(), name: "", description: "", hidden: false };
    onChange({ ...bookInfo, characters_list: [...characters, newChar] });
  }
  function removeChar(id: string) {
    onChange({ ...bookInfo, characters_list: characters.filter((c) => c.id !== id) });
  }
  function reorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const srcIdx = characters.findIndex((c) => c.id === sourceId);
    const tgtIdx = characters.findIndex((c) => c.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...characters];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    onChange({ ...bookInfo, characters_list: next });
  }

  return (
    <InfoPageShell {...props} aiChannel="characters" bookTitle={bookInfo.title || "this book"}>
      <div className="flex flex-col h-full p-6 mobile-p-3">
        <div className="flex-1 min-h-0 flex flex-col rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] overflow-hidden">
          <div className="shrink-0 flex items-center px-4" style={{ paddingTop: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-default)" }}>
            <span className="px-2 py-1.5 text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Characters</span>
            <span className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>Cast, roles, and descriptions</span>
            <div style={{ flex: 1 }} />
            <button onClick={addChar} className="rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors" style={{ background: "var(--overlay-active)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}>+ Add Character</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 mobile-px-4 flex flex-col">
            {characters.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No characters yet. Click &ldquo;Add Character&rdquo; to start.</p>
            )}
            {characters.map((c, idx) => {
              const hidden = !!c.hidden;
              const isDropTarget = dropTargetId === c.id && dragId !== c.id;
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragId && dragId !== c.id) setDropTargetId(c.id); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetId((prev) => prev === c.id ? null : prev); }}
                  onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, c.id); setDragId(null); setDropTargetId(null); }}
                  className="py-3"
                  style={{
                    borderTop: isDropTarget ? "2px solid var(--accent-blue, #5a9af5)" : (idx === 0 ? "none" : "1px solid var(--border-subtle)"),
                    opacity: dragId === c.id ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                      style={{ width: 18, height: 24, cursor: "grab" }}
                      title="Drag to reorder"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="2.5" r="1" /><circle cx="8" cy="2.5" r="1" /><circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" /><circle cx="4" cy="9.5" r="1" /><circle cx="8" cy="9.5" r="1" /></svg>
                    </span>
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => updateChar(c.id, { name: e.target.value })}
                      placeholder="Character name"
                      className="flex-1 bg-transparent border-none px-0 py-1 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none"
                    />
                    <button
                      onClick={() => updateChar(c.id, { hidden: !hidden })}
                      title={hidden ? "Show description" : "Hide description"}
                      className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-primary)] transition-colors"
                      style={{ width: 24, height: 24, background: "transparent", border: "none" }}
                    >
                      {hidden ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.38 18.38 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => removeChar(c.id)}
                      title="Delete character"
                      className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-red-400 transition-colors"
                      style={{ width: 24, height: 24, background: "transparent", border: "none" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                    </button>
                  </div>
                  {!hidden && (
                    <textarea
                      rows={2}
                      value={c.description}
                      onChange={(e) => { updateChar(c.id, { description: e.target.value }); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                      onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                      ref={(el) => { if (el && c.description) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                      placeholder="Description — background, role, arc, traits…"
                      className="mt-1 w-full resize-none bg-transparent border-none px-0 py-1 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </InfoPageShell>
  );
}

/* ─── AI Action Icons ───────────────────────────────────────── */

function AiActionBar({
  message,
  onUpdate,
  onSendToSynopsis,
  onGenerateChapters,
}: {
  message: AiMessage;
  onUpdate: (updated: AiMessage) => void;
  onSendToSynopsis?: (text: string) => void;
  onGenerateChapters?: (text: string) => void;
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
      {/* Structuring-only actions */}
      {onSendToSynopsis && message.role === "ai" && (
        <button title="Send to Synopsis" className={btnClass} style={{ color: inactiveColor, marginLeft: 4 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#f59e0b")} onMouseLeave={(e) => (e.currentTarget.style.color = inactiveColor)} onClick={() => onSendToSynopsis(message.text)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
        </button>
      )}
      {onGenerateChapters && message.role === "ai" && (
        <button title="Generate Chapters & Sections" className={btnClass} style={{ color: inactiveColor, marginLeft: 2 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#4ade80")} onMouseLeave={(e) => (e.currentTarget.style.color = inactiveColor)} onClick={() => onGenerateChapters(message.text)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
        </button>
      )}
      <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>
        {message.created_at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
        {message.created_at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ─── AI Panel ──────────────────────────────────────────────── */

function AiPanel({
  messages, onUpdateMessage, projectId, bookTitle, chapter, onAddMessage,
  mode, stage, projectContext, workContext, getSelectedText,
  hideHeader, activeFilter: externalFilter, onFilterChange,
  onSendToSynopsis, onGenerateChapters, panelTitle,
}: {
  messages: AiMessage[]; onUpdateMessage: (updated: AiMessage) => void; projectId: string; bookTitle: string; chapter: string; onAddMessage: (message: AiMessage) => void;
  mode?: string; stage?: string; projectContext?: ProjectContext; workContext?: AiWorkContext; getSelectedText?: () => string;
  hideHeader?: boolean;
  activeFilter?: AiFilter;
  onFilterChange?: (filter: AiFilter) => void;
  onSendToSynopsis?: (text: string) => void;
  onGenerateChapters?: (text: string) => void;
  /** Custom title for the panel header */
  panelTitle?: string;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [internalFilter, setInternalFilter] = useState<AiFilter>("brainstorm");
  const activeFilter = externalFilter ?? internalFilter;
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    const trimmed = input.trim();
    const userMsgLocalId = Date.now();
    onAddMessage(newAiMessage(userMsgLocalId, "user", trimmed));
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);
    try {
      // Build recent chat history from visible messages
      const recentHistory: ChatHistoryEntry[] = messages
        .filter((m) => !m.is_deleted && !m.is_hidden)
        .slice(-10)
        .map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, text: m.text }));

      // Load AI Engine config from Supabase
      const aiEngine = await loadAIEngineConfig();

      // Capture editor selection at the moment of submit
      const selectedText = getSelectedText ? getSelectedText() : "";

      const payload: Record<string, unknown> = {
        message: trimmed,
        project_id: projectId,
        chapter,
        bookTitle,
        mode: mode || "Book",
        page: stage || "compose",
        aiEngine,
        history: recentHistory,
      };
      if (projectContext) payload.projectContext = projectContext;
      // Merge selected text (or full section fallback) into work context
      const hasSelection = selectedText && selectedText.trim() !== "";
      const mergedWorkContext = workContext
        ? { ...workContext, ...(hasSelection ? { selectedText } : { fullSectionText: workContext.editorContent || "" }) }
        : hasSelection ? { currentPage: stage || "compose", selectedText } : undefined;
      if (mergedWorkContext) payload.workContext = mergedWorkContext;

      const res = await fetch("/api/brainstorm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      const aiMsgLocalId = Date.now() + 1;
      onAddMessage(newAiMessage(aiMsgLocalId, "ai", res.ok && data.reply ? data.reply : "I couldn't generate a response right now. Please try again.", data.aiMsgId));
      // Backfill db_id on the user message
      if (data.userMsgId) {
        onUpdateMessage({ ...newAiMessage(userMsgLocalId, "user", trimmed, data.userMsgId) });
      }
    } catch { onAddMessage(newAiMessage(Date.now() + 1, "ai", "I couldn't generate a response right now. Please try again.")); }
    finally { setLoading(false); }
  }

  const filtered = filterMessages(messages, activeFilter);

  function setActiveFilter(f: AiFilter) {
    setInternalFilter(f);
    if (onFilterChange) onFilterChange(f);
  }

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <div className="shrink-0 flex items-center px-4 pt-3 pb-2 border-b border-[var(--border-default)]" style={{ height: 46 }}>
          <span className="text-[12px] font-medium shrink-0 mr-auto" style={{ color: "var(--text-faint)" }}>{panelTitle || "AI Assistant"}</span>
          <div className="flex items-center gap-1" style={{ overflowX: "auto" }}>
            {AI_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${activeFilter === f.key ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto py-3">
        <div className="flex flex-col gap-4 pb-4" style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px" }}>
          {filtered.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end items-end gap-1.5 group/user">
                  <p className="max-w-[85%] rounded-lg px-5 py-3 text-[14px] text-[var(--text-secondary)] whitespace-pre-line" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>{msg.text}</p>
                  <button
                    onClick={() => onUpdateMessage({ ...msg, is_hidden: true })}
                    title="Hide message"
                    className="shrink-0 mb-2.5 opacity-0 group-hover/user:opacity-100 transition-opacity flex items-center justify-center"
                    style={{ width: 20, height: 20, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-faint)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-faint)")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  </button>
                  <button
                    onClick={() => onUpdateMessage({ ...msg, is_deleted: true })}
                    title="Delete message"
                    className="shrink-0 mb-2.5 opacity-0 group-hover/user:opacity-100 transition-opacity flex items-center justify-center"
                    style={{ width: 20, height: 20, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-faint)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-faint)")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ) : (
                <div style={{ padding: "0", marginBottom: 2 }}><AiMarkdown>{msg.text}</AiMarkdown><AiActionBar message={msg} onUpdate={onUpdateMessage} onSendToSynopsis={onSendToSynopsis} onGenerateChapters={onGenerateChapters} /></div>
              )}
            </div>
          ))}
          {filtered.length === 0 && !loading && <p className="text-[12px] text-[var(--text-faint)] text-center py-8">{activeFilter === "brainstorm" ? "Start a conversation with your AI assistant." : `No ${activeFilter} messages.`}</p>}
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
      <div className="shrink-0">
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "10px 16px 12px" }}>
        <div
          className="flex items-end gap-2 transition-colors focus-within:border-[rgba(90,154,245,0.3)]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 20, padding: "3px 8px 3px 12px" }}
        >
          <span style={{ color: "var(--text-faint)", fontSize: 16, flexShrink: 0, lineHeight: 1, paddingBottom: 6 }}>+</span>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Add an idea, ask a question, or give direction..."
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-faint)] resize-none"
            style={{ padding: "5px 0", fontFamily: "inherit", maxHeight: 120, overflowY: "auto", lineHeight: "1.5" }}
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
    </div>
  );
}

/* ─── Compose Page (split layout) — only for sections ───────── */

type RightPanelTab = "ai" | "notes";

function ComposePage({
  sectionTitle, chapterId, composeText, onComposeChange, aiMessages, onUpdateAiMessage, onAddAiMessage, projectId, bookTitle,
  mode, stage, projectCtx, workCtx, status, onStatusChange,
}: {
  sectionTitle: string; chapterId?: string; composeText: string; onComposeChange: (text: string) => void; aiMessages: AiMessage[]; onUpdateAiMessage: (updated: AiMessage) => void; onAddAiMessage: (message: AiMessage) => void; projectId: string; bookTitle: string;
  mode?: string; stage?: string; projectCtx?: ProjectContext; workCtx?: AiWorkContext;
  status: ComposeStatus; onStatusChange: (s: ComposeStatus) => void;
}) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightPanelTab>("ai");
  const [aiFilter, setAiFilter] = useState<AiFilter>("brainstorm");
  const [mobileComposeTab, setMobileComposeTab] = useState<"content" | "assistant">("content");
  const [dividerX, setDividerX] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const getSelectionRef = useRef<() => string>(() => "");
  const [notepadEditor, setNotepadEditor] = useState<Editor | null>(null);

  // ─── Single note per section ───
  const [notesContent, setNotesContent] = useState("");
  const notesSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionIdForNotes = chapterId || sectionTitle;
  const sectionIdRef = useRef(sectionIdForNotes);
  sectionIdRef.current = sectionIdForNotes;
  // Track which content came from the server so we don't save it back immediately
  const notesServerContent = useRef("");
  const notesUserEdited = useRef(false);

  // Load note when section changes
  useEffect(() => {
    if (notesSaveRef.current) { clearTimeout(notesSaveRef.current); notesSaveRef.current = null; }
    notesUserEdited.current = false;
    if (!projectId || !sectionIdForNotes) return;
    fetch(`/api/projects/${projectId}/notes?section_id=${encodeURIComponent(sectionIdForNotes)}`)
      .then((res) => res.json())
      .then((data) => {
        const content = Array.isArray(data) ? (data[0]?.content ?? "") : (data?.content ?? "");
        notesServerContent.current = content;
        setNotesContent(content);
      })
      .catch(() => { notesServerContent.current = ""; setNotesContent(""); });
  }, [projectId, sectionIdForNotes]);

  // Handle note changes from the editor
  function handleNotesChange(html: string) {
    setNotesContent(html);
    notesUserEdited.current = true;
    if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
    const sid = sectionIdRef.current;
    notesSaveRef.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sid, content: html }),
      });
    }, 800);
  }

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

  const isNotes = rightTab === "notes";

  function tabStyle(active: boolean): React.CSSProperties {
    return active
      ? { border: "1px solid var(--border-subtle)", borderBottom: "2px solid var(--accent-blue)", borderRadius: "6px 6px 0 0", background: "var(--overlay-hover)", marginBottom: -1 }
      : { border: "1px solid transparent", borderBottom: "2px solid transparent", borderRadius: "6px 6px 0 0", marginBottom: -1 };
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      {/* Mobile tab switcher: Content | AI Assistant */}
      <div className="desktop-hidden shrink-0 flex" style={{ borderBottom: "1px solid var(--border-default)" }}>
        {([["content", "Content"], ["assistant", "AI Assistant"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setMobileComposeTab(key); if (key === "assistant") setRightPanelOpen(true); }}
            className="flex-1 py-2 text-[13px] font-medium transition-colors"
            style={{
              color: mobileComposeTab === key ? "var(--text-primary)" : "var(--text-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottomWidth: 2,
              borderBottomStyle: "solid",
              borderBottomColor: mobileComposeTab === key ? "var(--accent-blue, #5a9af5)" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
      {/* Left: Composer */}
      <div className={`flex flex-col min-h-0 pt-6 pl-6 pb-6 mobile-px-4 mobile-panel-full${mobileComposeTab !== "content" ? " mobile-hidden" : ""}`} style={{ width: rightPanelOpen ? `${dividerX}%` : "100%", cursor: "default" }}>
        <div
          className="flex-1 min-h-0 flex flex-col rounded-md border border-[var(--border-default)] overflow-hidden"
          style={{ minHeight: 300, background: "var(--overlay-card)" }}
        >
          <div className="flex-1 min-h-0 p-6 notepad-tight">
            <RichTextEditor content={composeText} onChange={onComposeChange} placeholder="Start writing…" onEditorReady={(fn) => { getSelectionRef.current = fn; }} contextLabel={sectionTitle} />
          </div>
          <div className="shrink-0">
            <div className="flex items-center justify-end gap-4" style={{ padding: "10px 24px 12px" }}>
              {(["unstarted", "started", "completed"] as const).map((s) => {
                const meta = COMPOSE_STATUS_META[s];
                const active = status === s;
                return (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer text-[12px]" style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}>
                    <input
                      type="radio"
                      name="compose-status"
                      checked={active}
                      onChange={() => onStatusChange(s)}
                      style={{ accentColor: meta.color, cursor: "pointer" }}
                    />
                    <span>{meta.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* Divider — desktop only */}
      {rightPanelOpen && (
        <div className="shrink-0 flex items-center justify-center mobile-hidden" style={{ width: 16, cursor: "col-resize", position: "relative", zIndex: 10 }} onMouseDown={handleMouseDown}>
          <button onClick={() => setRightPanelOpen(false)} title="Close panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="3,1 7,5 3,9" /></svg>
          </button>
        </div>
      )}
      {!rightPanelOpen && (
        <div className="shrink-0 flex items-center mobile-hidden" style={{ position: "relative", width: 16 }}>
          <button onClick={() => setRightPanelOpen(true)} title="Open panel" className="absolute flex items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] transition-colors hover:bg-[var(--surface-3)]" style={{ width: 22, height: 22, right: -11, zIndex: 11 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="7,1 3,5 7,9" /></svg>
          </button>
        </div>
      )}
      {/* Right panel */}
      {rightPanelOpen && (
        <div className={`min-h-0 flex flex-col pr-6 pt-6 pb-6 mobile-px-4 mobile-panel-full${mobileComposeTab !== "assistant" ? " mobile-hidden" : ""}`} style={{ width: `${100 - dividerX}%` }}>
          <div
            className="flex-1 min-h-0 flex flex-col rounded-md border border-[var(--border-default)] overflow-hidden"
            style={{
              minHeight: 300,
              background: isNotes ? "var(--surface-notes)" : "var(--overlay-card)",
              transition: "background 0.2s ease",
              cursor: "default",
            }}
          >
            {/* ── Menu row: tabs left, AI filters right ── */}
            <div className="shrink-0 flex items-end px-3" style={{ paddingTop: 8, borderBottom: "1px solid var(--border-default)" }}>
              <button onClick={() => setRightTab("ai")} className={`px-3 py-1.5 text-[13px] transition-colors ${rightTab === "ai" ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`} style={tabStyle(rightTab === "ai")}>AI Assistant</button>
              <button onClick={() => setRightTab("notes")} className={`px-3 py-1.5 text-[13px] transition-colors ${rightTab === "notes" ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"}`} style={tabStyle(rightTab === "notes")}>Notepad</button>
              <div style={{ flex: 1 }} />
              {!isNotes && (
                <div className="flex items-center gap-1 pb-1.5">
                  {AI_FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setAiFilter(f.key)} className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${aiFilter === f.key ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>{f.label}</button>
                  ))}
                </div>
              )}
              {isNotes && notepadEditor && (
                <div className="flex items-center gap-0.5 pb-1.5">
                  <ToolbarButton active={notepadEditor.isActive("bold")} onClick={() => notepadEditor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><span style={{ fontWeight: 700, fontSize: 13 }}>B</span></ToolbarButton>
                  <ToolbarButton active={notepadEditor.isActive("italic")} onClick={() => notepadEditor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><span style={{ fontWeight: 500, fontSize: 13, fontStyle: "italic" }}>I</span></ToolbarButton>
                  <ToolbarButton active={notepadEditor.isActive("underline")} onClick={() => notepadEditor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><span style={{ fontWeight: 500, fontSize: 13, textDecoration: "underline" }}>U</span></ToolbarButton>
                  <ColorPicker editor={notepadEditor} />
                  <div style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
                  <ToolbarButton active={notepadEditor.isActive("bulletList")} onClick={() => notepadEditor.chain().focus().toggleBulletList().run()} title="Bullet list">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" /></svg>
                  </ToolbarButton>
                  <ToolbarButton active={notepadEditor.isActive("orderedList")} onClick={() => notepadEditor.chain().focus().toggleOrderedList().run()} title="Numbered list">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
                  </ToolbarButton>
                  <ToolbarButton onClick={() => { if (notepadEditor.can().sinkListItem("listItem")) notepadEditor.chain().focus().sinkListItem("listItem").run(); }} title="Indent">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="4" x2="21" y2="4" /><line x1="11" y1="10" x2="21" y2="10" /><line x1="11" y1="16" x2="21" y2="16" /><line x1="3" y1="22" x2="21" y2="22" /><polyline points="3,8 7,13 3,18" /></svg>
                  </ToolbarButton>
                  <ToolbarButton onClick={() => { if (notepadEditor.can().liftListItem("listItem")) notepadEditor.chain().focus().liftListItem("listItem").run(); }} title="Outdent">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="4" x2="21" y2="4" /><line x1="11" y1="10" x2="21" y2="10" /><line x1="11" y1="16" x2="21" y2="16" /><line x1="3" y1="22" x2="21" y2="22" /><polyline points="7,8 3,13 7,18" /></svg>
                  </ToolbarButton>
                  <div style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
                  <ToolbarButton onClick={() => notepadEditor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /><line x1="3" y1="21" x2="21" y2="3" /></svg>
                  </ToolbarButton>
                </div>
              )}
            </div>

            {/* AI Assistant */}
            <div className="flex-1 min-h-0" style={{ display: rightTab === "ai" ? "flex" : "none", flexDirection: "column" }}>
              <AiPanel messages={aiMessages} onUpdateMessage={onUpdateAiMessage} projectId={projectId} bookTitle={bookTitle} chapter={chapterId || sectionTitle} onAddMessage={onAddAiMessage} mode={mode} stage={stage} projectContext={projectCtx} workContext={workCtx} getSelectedText={getSelectionRef.current} hideHeader activeFilter={aiFilter} onFilterChange={setAiFilter} />
            </div>

            {/* Notes — single writing pad with same editor as Composer */}
            <div className="flex-1 min-h-0 notepad-tight" style={{ display: rightTab === "notes" ? "flex" : "none", flexDirection: "column" }}>
              <RichTextEditor content={notesContent} onChange={handleNotesChange} placeholder="Capture ideas, references, or thoughts for this section…" borderless hideToolbar onEditor={setNotepadEditor} />
            </div>
          </div>
        </div>
      )}
      </div>{/* end flex row */}
    </div>
  );
}

/* ─── Structuring Page (full AI assistant) ──────────────────── */

function StructuringPage({
  aiMessages, onUpdateAiMessage, onAddAiMessage, projectId, bookTitle,
  mode, stage, projectCtx, workCtx,
  onSendToSynopsis, onGenerateChapters,
}: {
  aiMessages: AiMessage[];
  onUpdateAiMessage: (updated: AiMessage) => void;
  onAddAiMessage: (message: AiMessage) => void;
  projectId: string;
  bookTitle: string;
  mode?: string;
  stage?: string;
  projectCtx?: ProjectContext;
  workCtx?: AiWorkContext;
  onSendToSynopsis?: (text: string) => void;
  onGenerateChapters?: (text: string) => void;
}) {
  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 min-h-0 flex flex-col">
        <AiPanel
          messages={aiMessages}
          onUpdateMessage={onUpdateAiMessage}
          projectId={projectId}
          bookTitle={bookTitle}
          chapter="structuring"
          onAddMessage={onAddAiMessage}
          mode={mode}
          stage={stage}
          projectContext={projectCtx}
          workContext={workCtx}
          onSendToSynopsis={onSendToSynopsis}
          onGenerateChapters={onGenerateChapters}
          panelTitle="AI Assistant - Structuring Mode"
        />
      </div>
    </div>
  );
}

/* ─── Inline Editable Title ─────────────────────────────────── */

function InlineTitle({
  value, onChange, className, style, autoFocus, stopClickPropagation,
}: {
  value: string; onChange: (v: string) => void; className?: string; style?: React.CSSProperties; autoFocus?: boolean; stopClickPropagation?: boolean;
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
      onClick={stopClickPropagation ? (e) => e.stopPropagation() : undefined}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      className={`bg-transparent border-none outline-none ${className ?? ""}`}
      style={{ padding: 0, ...style }}
    />
  );
}

/* ─── Publish Sidebar ──────────────────────────────────────── */

function PublishSidebar({
  chapters, composeTexts, bookVersions, bookInfo, selectedVersionId, onPreview, onExport, onAdapt,
}: {
  chapters: ChapterData[];
  composeTexts: Record<string, string>;
  bookVersions: { id: string; version_number: number; source: string; status: string; created_at: string; derived_status?: string }[];
  bookInfo: BookInfo;
  selectedVersionId: string | null;
  onPreview: (versionId: string) => void;
  onExport: (versionId: string) => void;
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

  // ~225 words per page for standard trade paperback (5.5×8.5 or 6×9 trim)
  const estimatedPages = Math.max(1, Math.ceil(totalWordCount / 225));

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
          <div className="flex items-start justify-between gap-3">
            <span className="text-[12px] shrink-0" style={{ color: "var(--text-muted)", paddingTop: 1 }}>Author</span>
            <span className="text-[13px] font-medium text-right" style={{ color: "var(--text-primary)" }}>{bookInfo.author || "—"}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[12px] shrink-0" style={{ color: "var(--text-muted)", paddingTop: 1 }}>Category</span>
            <span className="text-[13px] font-medium text-right" style={{ color: "var(--text-primary)" }}>{bookInfo.genre || "—"}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[12px] shrink-0" style={{ color: "var(--text-muted)", paddingTop: 1 }}>Year Published</span>
            <span className="text-[13px] font-medium text-right" style={{ color: "var(--text-primary)" }}>{bookInfo.year_published || "—"}</span>
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
              <button
                disabled={!actionsEnabled}
                onClick={() => { if (activeVersion) onExport(activeVersion.id); }}
                className="w-full rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)] disabled:opacity-40 disabled:cursor-default"
                style={{ color: actionsEnabled ? "var(--text-secondary)" : "var(--text-muted)" }}
              >
                Download / Export
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
  const { isModeEnabled } = useModes();
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
  const [confirmRemoveSection, setConfirmRemoveSection] = useState<
    | { kind: "chapter"; chapterId: string; sectionId: string; title: string }
    | { kind: "prologue"; sectionId: string; title: string }
    | { kind: "epilogue"; sectionId: string; title: string }
    | null
  >(null);
  const [aiMessages, setAiMessages] = useState<Record<string, AiMessage[]>>({});
  const [composeTexts, setComposeTexts] = useState<Record<string, string>>({});
  const [bookInfo, setBookInfo] = useState<BookInfo>(EMPTY_BOOK_INFO);
  const [bookVersions, setBookVersions] = useState<{ id: string; version_number: number; source: string; status: string; created_at: string; derived_status?: string }[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showAdaptModal, setShowAdaptModal] = useState(false);
  const [publishLang, setPublishLang] = useState("");
  const [mobilePublishTab, setMobilePublishTab] = useState<"publish" | "info">("publish");
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
        newMessages[ch] = rows.map((row: Record<string, unknown>, i: number) => {
          const msg = newAiMessage(i + 1, (row.role === "assistant" ? "ai" : "user") as AiMessage["role"], row.message as string, row.id as string);
          msg.is_favorite = !!row.is_favorite;
          msg.is_liked = !!row.is_liked;
          msg.is_disliked = !!row.is_disliked;
          msg.is_hidden = !!row.is_hidden;
          msg.is_deleted = !!row.is_deleted;
          return msg;
        });
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

  // Auto-save compose texts (debounced) — Source: draft_blocks table. Used by Compose + Manuscript.
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

  // Load compose texts from drafts — Source: draft_blocks table. Feeds both Compose editor and Manuscript preview.
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
    const chapterNum = chapters.length + 1;
    const newChapter: ChapterData = {
      id,
      number: chapterNum,
      title: "Untitled Chapter",
      summary: "",
      status: "draft",
      sections: [{ id: sectionId, number: 1, title: "Introduction", summary: "", status: "draft" }],
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
      const sectionNum = ch.sections.length + 1;
      return { ...ch, sections: [...ch.sections, { id: sectionId, number: sectionNum, title: "Untitled Section", summary: "", status: "draft" as SectionStatus }] };
    }));
    setExpandedChapters((prev) => ({ ...prev, [chapterId]: true }));
    setSelection({ type: "section", chapterId, sectionId });
    setAutoFocusId(sectionId);
  }

  // ─── Prologue / Epilogue section management ─────────────────
  function handleAddPrologueSection() {
    const sectionId = crypto.randomUUID();
    const sections = [...(bookInfo.prologue_sections ?? []), { id: sectionId, title: "Untitled Section" }];
    handleBookInfoChange({ ...bookInfo, prologue_sections: sections });
    setExpandedChapters((prev) => ({ ...prev, prologue: true }));
    setSelection({ type: "prologue_section", sectionId });
    setAutoFocusId(sectionId);
  }

  function handleAddEpilogueSection() {
    const sectionId = crypto.randomUUID();
    const sections = [...(bookInfo.epilogue_sections ?? []), { id: sectionId, title: "Untitled Section" }];
    handleBookInfoChange({ ...bookInfo, epilogue_sections: sections });
    setExpandedChapters((prev) => ({ ...prev, epilogue: true }));
    setSelection({ type: "epilogue_section", sectionId });
    setAutoFocusId(sectionId);
  }

  function handleRenamePrologueSection(sectionId: string, newTitle: string) {
    handleBookInfoChange({ ...bookInfo, prologue_sections: (bookInfo.prologue_sections ?? []).map((s) => s.id === sectionId ? { ...s, title: newTitle } : s) });
  }

  function handleRenameEpilogueSection(sectionId: string, newTitle: string) {
    handleBookInfoChange({ ...bookInfo, epilogue_sections: (bookInfo.epilogue_sections ?? []).map((s) => s.id === sectionId ? { ...s, title: newTitle } : s) });
  }

  function handleRemovePrologueSection(sectionId: string) {
    handleBookInfoChange({ ...bookInfo, prologue_sections: (bookInfo.prologue_sections ?? []).filter((s) => s.id !== sectionId) });
    if (selection.type === "prologue_section" && selection.sectionId === sectionId) setSelection({ type: "prologue" });
  }

  function handleRemoveEpilogueSection(sectionId: string) {
    handleBookInfoChange({ ...bookInfo, epilogue_sections: (bookInfo.epilogue_sections ?? []).filter((s) => s.id !== sectionId) });
    if (selection.type === "epilogue_section" && selection.sectionId === sectionId) setSelection({ type: "epilogue" });
  }

  function getSectionStatus(key: string): ComposeStatus {
    return (bookInfo.section_statuses ?? {})[key] ?? "unstarted";
  }

  function handleSectionStatusChange(key: string, status: ComposeStatus) {
    const next = { ...(bookInfo.section_statuses ?? {}), [key]: status };
    handleBookInfoChange({ ...bookInfo, section_statuses: next });
  }

  // ─── Structuring actions ─────────────────────────────────────
  function handleSendToSynopsis(text: string) {
    if (bookInfo.synopsis?.trim()) {
      if (!confirm("This will replace the existing synopsis. Continue?")) return;
    }
    const updated = { ...bookInfo, synopsis: text, synopsis_approved: false };
    handleBookInfoChange(updated);
    setSelection({ type: "synopsis" });
  }

  function handleGenerateChapters(text: string) {
    if (!bookInfo.synopsis?.trim()) {
      alert("Please set a synopsis first before generating chapters.");
      return;
    }
    if (!bookInfo.synopsis_approved) {
      alert("Please approve the synopsis before generating chapters.\n\nYou can approve it in the Synopsis field on the Book Info page.");
      return;
    }

    const parsed = parseChapterStructure(text);
    if (parsed.length === 0) {
      alert("No chapters found in this response.\n\nMake sure the AI response contains chapters in this format:\n\nChapter 1: Title\nChapter 2: Title\n\nTip: Ask the AI to \"generate chapter outline\" first, then click this button on that response.");
      return;
    }

    if (chapters.length > 0) {
      if (!confirm(`This will replace all ${chapters.length} existing chapters. Continue?`)) return;
    }

    const newChapters: ChapterData[] = parsed.map((ch, chIdx) => ({
      id: crypto.randomUUID(),
      number: chIdx + 1,
      title: ch.title,
      summary: "",
      status: "draft" as SectionStatus,
      sections: ch.sections.map((s, secIdx) => ({
        id: crypto.randomUUID(),
        number: secIdx + 1,
        title: s,
        summary: "",
        status: "draft" as SectionStatus,
      })),
    }));

    setChapters(newChapters);
    const expanded: Record<string, boolean> = {};
    for (const ch of newChapters) expanded[ch.id] = true;
    setExpandedChapters(expanded);
    if (newChapters[0]?.sections[0]) {
      setSelection({ type: "section", chapterId: newChapters[0].id, sectionId: newChapters[0].sections[0].id });
    }
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
    // Persist flag changes to database
    if (updated.db_id && projectId) {
      fetch(`/api/projects/${projectId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: updated.db_id,
          is_favorite: updated.is_favorite,
          is_liked: updated.is_liked,
          is_disliked: updated.is_disliked,
          is_hidden: updated.is_hidden,
          is_deleted: updated.is_deleted,
        }),
      }).catch((err) => console.error("Failed to persist message flags:", err));
    }
  }

  // ─── Publish ───────────────────────────────────────────────

  const [sendingToPublish, setSendingToPublish] = useState(false);
  const [sendToPublishSuccess, setSendToPublishSuccess] = useState(false);

  // Snapshot composeTexts (draft_blocks) → book_versions + book_version_sections.
  // This is a ONE-WAY copy. Publish edits do NOT flow back to Compose or Manuscript.
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
  const isWritableSection = selection.type === "section" || selection.type === "prologue" || selection.type === "epilogue" || selection.type === "prologue_section" || selection.type === "epilogue_section";
  const composeKey = (() => {
    if (selection.type === "section") return selection.sectionId;
    if (selection.type === "prologue") return "prologue";
    if (selection.type === "epilogue") return "epilogue";
    if (selection.type === "prologue_section") return selection.sectionId;
    if (selection.type === "epilogue_section") return selection.sectionId;
    return "";
  })();

  const currentSectionTitle = (() => {
    if (selection.type === "prologue") return "Prologue";
    if (selection.type === "epilogue") return "Epilogue";
    if (selection.type === "prologue_section") {
      const sec = bookInfo.prologue_sections?.find((s) => s.id === selection.sectionId);
      return sec?.title ?? "Untitled Section";
    }
    if (selection.type === "epilogue_section") {
      const sec = bookInfo.epilogue_sections?.find((s) => s.id === selection.sectionId);
      return sec?.title ?? "Untitled Section";
    }
    if (selection.type === "section") {
      const ch = chapters.find((c) => c.id === selection.chapterId);
      const sec = ch?.sections.find((s) => s.id === selection.sectionId);
      return sec?.title ?? "Untitled Section";
    }
    return "";
  })();

  // Resolved AI context for the instruction pipeline
  // Structuring: always include synopsis (it's being worked on)
  const structuringProjectCtx = resolveProjectContext(bookInfo, projectName);
  // Compose: only include synopsis if approved, so the writer works from the locked-in version
  const composeBookInfo = bookInfo.synopsis_approved ? bookInfo : { ...bookInfo, synopsis: "" };
  const aiProjectCtx = resolveProjectContext(composeBookInfo, projectName);
  const currentChapterTitle = (() => {
    if (selection.type === "chapter" || selection.type === "section") {
      const ch = chapters.find((c) => c.id === selection.chapterId);
      return ch?.title ?? undefined;
    }
    return undefined;
  })();
  const aiWorkCtx = resolveWorkContext({
    stage: activeStage,
    chapterTitle: currentChapterTitle,
    sectionTitle: currentSectionTitle || undefined,
    editorContent: isWritableSection ? composeTexts[composeKey] : undefined,
  });
  const aiStage = activeStage.toLowerCase() as AiStageKey;

  // Block disabled modes
  if (projectType && !isModeEnabled(projectType as ModeKey)) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: "100vh", background: "var(--surface-1)" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.25 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>
            Mode unavailable
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
            This mode is currently disabled in Settings.
          </p>
          <button
            onClick={() => router.push("/")}
            className="text-[12px] font-medium"
            style={{
              marginTop: 20,
              padding: "6px 14px",
              borderRadius: 6,
              background: "var(--overlay-hover)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  // Render App mode
  if (projectType === "App") {
    return <AppMode projectId={projectId} projectName={projectName} />;
  }

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--surface-1)", position: "relative", zIndex: 1, isolation: "isolate" }}>
      {/* Project header bar */}
      <div
        className="flex shrink-0 items-center gap-4 mobile-px-4"
        style={{ height: 56, background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)", padding: "0 24px" }}
      >
        {/* Desktop: open main app sidebar */}
        <button className="mobile-hidden flex items-center justify-center" onClick={openMainSidebar} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }} aria-label="Open navigation">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
        </button>
        {/* Mobile: open project sidebar */}
        <button className="desktop-hidden flex items-center justify-center" onClick={() => setMobileSidebarOpen((v) => !v)} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }} aria-label="Toggle sidebar">
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
        <aside className={`shrink-0 border-r border-[var(--border-default)] overflow-y-auto ${mobileSidebarOpen ? "fixed inset-y-0 left-0" : "mobile-hidden"}`} style={{ width: 280, background: "var(--surface-1)", zIndex: 41, top: mobileSidebarOpen ? 56 : undefined, cursor: "default" }}>
          {/* Book | Workspace tabs (hidden on Publish) */}
          {!(topTab === "Book" && activeStage === "Publish") && (
          <div className="flex items-end gap-1 pl-1 pr-4 pt-4 pb-0 mx-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
            {TOP_TABS.map((tab) => (
              <button key={tab} onClick={() => setTopTab(tab)} className={`px-3 py-1.5 text-[13px] transition-colors ${topTab === tab ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)]"}`} style={topTab === tab ? { border: "1px solid var(--border-subtle)", borderBottom: "2px solid var(--accent-blue)", borderRadius: "6px 6px 0 0", background: "var(--overlay-hover)", marginBottom: -1 } : { border: "1px solid transparent", borderBottom: "2px solid transparent", borderRadius: "6px 6px 0 0", marginBottom: -1 }}>{tab}</button>
            ))}
          </div>
          )}

          {/* Publish sidebar: Project Status panel */}
          {topTab === "Book" && activeStage === "Publish" && (
          <PublishSidebar chapters={chapters} composeTexts={composeTexts} bookVersions={bookVersions} bookInfo={bookInfo} selectedVersionId={selectedVersionId} onPreview={(vId) => router.push(`/projects/${projectId}/book/${vId}`)} onExport={(vId) => router.push(`/projects/${projectId}/export/book?version=${vId}`)} onAdapt={() => setShowAdaptModal(true)} />
          )}

          {/* Book sidebar content */}
          {topTab === "Book" && activeStage === "Compose" && (
          <nav className="flex flex-col gap-0.5 text-[14px] px-4 pt-5 pb-4">
            {/* ── Setup group (collapsible) ── */}
            {(() => {
              const setupTypes = ["structuring", "book_info", "characters", "storyline", "synopsis"];
              const isSetupChildActive = setupTypes.includes(selection.type);
              return (
                <div>
                  <div className="flex items-center">
                    <button
                      onClick={() => setSetupExpanded((v) => !v)}
                      className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                      style={{ width: 16, height: 16 }}
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${setupExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                    </button>
                    <button
                      onClick={() => setSetupExpanded((v) => !v)}
                      className={`flex-1 rounded px-1 py-1.5 text-left text-[14px] font-medium min-w-0 transition-colors ${isSetupChildActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                    >
                      Setup
                    </button>
                  </div>
                  {setupExpanded && (
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                      <button onClick={() => setSelection({ type: "structuring" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${selection.type === "structuring" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>Structuring</button>
                      <button onClick={() => setSelection({ type: "book_info" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${selection.type === "book_info" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>Book Info</button>
                      <button onClick={() => setSelection({ type: "characters" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${selection.type === "characters" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>Characters</button>
                      <button onClick={() => setSelection({ type: "storyline" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${selection.type === "storyline" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>Storyline</button>
                      <button onClick={() => setSelection({ type: "synopsis" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${selection.type === "synopsis" ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}>Synopsis</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Chapters */}
            <div className="mt-3 mb-1 flex items-center justify-between px-2">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Chapters</span>
              <div className="flex items-center gap-1.5">
                {chapters.length > 0 && (
                  <button
                    onClick={() => {
                      const allExpanded = chapters.every((ch) => expandedChapters[ch.id] ?? false);
                      const next: Record<string, boolean> = {};
                      for (const ch of chapters) next[ch.id] = !allExpanded;
                      setExpandedChapters(next);
                    }}
                    title={chapters.every((ch) => expandedChapters[ch.id] ?? false) ? "Collapse all" : "Expand all"}
                    className="text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                  >
                    {chapters.every((ch) => expandedChapters[ch.id] ?? false) ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,14 12,6 20,14" /><polyline points="4,20 12,12 20,20" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,4 12,12 20,4" /><polyline points="4,10 12,18 20,10" /></svg>
                    )}
                  </button>
                )}
                <button onClick={handleAddChapter} title="Add chapter" className="text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" /></svg>
                </button>
              </div>
            </div>

            {/* Prologue — chapter-like expandable */}
            {(() => {
              const prologueExpanded = expandedChapters["prologue"] ?? false;
              const pSections = bookInfo.prologue_sections ?? [];
              const isPrologueActive = selection.type === "prologue";
              const isPrologueChildActive = selection.type === "prologue_section";
              return (
                <div>
                  <div className="group flex items-center">
                    <button onClick={() => setExpandedChapters((prev) => ({ ...prev, prologue: !prev.prologue }))} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${prologueExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                    </button>
                    <button onClick={() => { setExpandedChapters((prev) => ({ ...prev, prologue: !prev.prologue })); }} className={`flex-1 rounded px-1 py-1.5 text-left text-[14px] font-medium min-w-0 transition-colors ${isPrologueActive || isPrologueChildActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Prologue
                    </button>
                    {pSections.length > 0 && <span className="shrink-0 text-[11px] mr-1" style={{ color: "var(--text-faint)" }}>({pSections.length})</span>}
                    <button onClick={handleAddPrologueSection} title="Add section" className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-0.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
                    </button>
                  </div>
                  {prologueExpanded && (
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                      {/* Main prologue content */}
                      <button onClick={() => setSelection({ type: "prologue" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${isPrologueActive ? "bg-[var(--overlay-active)]" : ""}`}>
                        <StatusBubble status={getSectionStatus("prologue")} />
                        <InlineTitle
                          value={bookInfo.prologue_main_title ?? "Main"}
                          onChange={(v) => handleBookInfoChange({ ...bookInfo, prologue_main_title: v })}
                          className="flex-1 text-[13px]"
                          style={{ color: isPrologueActive ? "var(--text-primary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        />
                      </button>
                      {pSections.map((sec) => {
                        const isActive = selection.type === "prologue_section" && selection.sectionId === sec.id;
                        return (
                          <div key={sec.id} className="group/sec flex items-center">
                            <button onClick={() => setSelection({ type: "prologue_section", sectionId: sec.id })} className={`flex-1 rounded px-2 py-1 text-left min-w-0 transition-colors flex items-center gap-2 ${isActive ? "bg-[var(--overlay-active)]" : ""}`}>
                              <StatusBubble status={getSectionStatus(sec.id)} />
                              <InlineTitle value={sec.title} onChange={(v) => handleRenamePrologueSection(sec.id, v)} autoFocus={autoFocusId === sec.id} className="flex-1 text-[13px]" style={{ color: isActive ? "var(--text-primary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
                            </button>
                            <button onClick={() => setConfirmRemoveSection({ kind: "prologue", sectionId: sec.id, title: sec.title })} title="Remove" className="shrink-0 opacity-0 group-hover/sec:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all pr-1">
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
                            </button>
                          </div>
                        );
                      })}
                      {pSections.length === 0 && (
                        <button onClick={handleAddPrologueSection} className="px-2 py-1 text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-blue)] transition-colors text-left">+ Add Section</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {chapters.map((ch, chIdx) => {
              const isExpanded = expandedChapters[ch.id] ?? false;
              const isChapterActive = selection.type === "chapter" && selection.chapterId === ch.id;
              const isChildActive = selection.type === "section" && selection.chapterId === ch.id;

              return (
                <div key={ch.id}>
                  <div className="group flex items-center">
                    <button onClick={() => setExpandedChapters((prev) => ({ ...prev, [ch.id]: !prev[ch.id] }))} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                    </button>
                    <div
                      onClick={() => setExpandedChapters((prev) => ({ ...prev, [ch.id]: !prev[ch.id] }))}
                      className="flex-1 rounded px-1 py-1.5 min-w-0 flex items-baseline cursor-pointer"
                    >
                      <span
                        className="shrink-0 text-[14px] font-medium"
                        style={{ color: isChapterActive || isChildActive ? "var(--text-primary)" : "var(--text-tertiary)" }}
                      >
                        {String(chIdx + 1).padStart(2, "0")}-&nbsp;
                      </span>
                      <InlineTitle
                        value={ch.title.replace(/^chapter\s+\d+\s*[:.–\-]\s*/i, "").trim() || ch.title}
                        onChange={(v) => handleRenameChapter(ch.id, v)}
                        autoFocus={autoFocusId === ch.id}
                        className="flex-1 text-[14px] font-medium min-w-0"
                        style={{ color: isChapterActive || isChildActive ? "var(--text-primary)" : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        stopClickPropagation
                      />
                      {ch.sections.length > 0 && (
                        <span className="shrink-0 text-[11px] ml-1" style={{ color: "var(--text-faint)" }}>({ch.sections.length})</span>
                      )}
                    </div>
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
                            <button onClick={() => setSelection({ type: "section", chapterId: ch.id, sectionId: sec.id })} className={`flex-1 rounded px-2 py-1 text-left min-w-0 transition-colors flex items-center gap-2 ${isSectionActive ? "bg-[var(--overlay-active)]" : ""}`}>
                              <StatusBubble status={getSectionStatus(sec.id)} />
                              <InlineTitle
                                value={sec.title}
                                onChange={(v) => handleRenameSection(ch.id, sec.id, v)}
                                autoFocus={autoFocusId === sec.id}
                                className="flex-1 text-[13px]"
                                style={{ color: isSectionActive ? "var(--text-primary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              />
                            </button>
                            <button
                              onClick={() => setConfirmRemoveSection({ kind: "chapter", chapterId: ch.id, sectionId: sec.id, title: sec.title })}
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

            {/* Epilogue — chapter-like expandable */}
            {(() => {
              const epilogueExpanded = expandedChapters["epilogue"] ?? false;
              const eSections = bookInfo.epilogue_sections ?? [];
              const isEpilogueActive = selection.type === "epilogue";
              const isEpilogueChildActive = selection.type === "epilogue_section";
              return (
                <div>
                  <div className="group flex items-center">
                    <button onClick={() => setExpandedChapters((prev) => ({ ...prev, epilogue: !prev.epilogue }))} className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors" style={{ width: 16, height: 16 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${epilogueExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                    </button>
                    <button onClick={() => { setExpandedChapters((prev) => ({ ...prev, epilogue: !prev.epilogue })); }} className={`flex-1 rounded px-1 py-1.5 text-left text-[14px] font-medium min-w-0 transition-colors ${isEpilogueActive || isEpilogueChildActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Epilogue
                    </button>
                    {eSections.length > 0 && <span className="shrink-0 text-[11px] mr-1" style={{ color: "var(--text-faint)" }}>({eSections.length})</span>}
                    <button onClick={handleAddEpilogueSection} title="Add section" className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-all px-0.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
                    </button>
                  </div>
                  {epilogueExpanded && (
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                      {/* Main epilogue content */}
                      <button onClick={() => setSelection({ type: "epilogue" })} className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0 ${isEpilogueActive ? "bg-[var(--overlay-active)]" : ""}`}>
                        <StatusBubble status={getSectionStatus("epilogue")} />
                        <InlineTitle
                          value={bookInfo.epilogue_main_title ?? "Main"}
                          onChange={(v) => handleBookInfoChange({ ...bookInfo, epilogue_main_title: v })}
                          className="flex-1 text-[13px]"
                          style={{ color: isEpilogueActive ? "var(--text-primary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        />
                      </button>
                      {eSections.map((sec) => {
                        const isActive = selection.type === "epilogue_section" && selection.sectionId === sec.id;
                        return (
                          <div key={sec.id} className="group/sec flex items-center">
                            <button onClick={() => setSelection({ type: "epilogue_section", sectionId: sec.id })} className={`flex-1 rounded px-2 py-1 text-left min-w-0 transition-colors flex items-center gap-2 ${isActive ? "bg-[var(--overlay-active)]" : ""}`}>
                              <StatusBubble status={getSectionStatus(sec.id)} />
                              <InlineTitle value={sec.title} onChange={(v) => handleRenameEpilogueSection(sec.id, v)} autoFocus={autoFocusId === sec.id} className="flex-1 text-[13px]" style={{ color: isActive ? "var(--text-primary)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
                            </button>
                            <button onClick={() => setConfirmRemoveSection({ kind: "epilogue", sectionId: sec.id, title: sec.title })} title="Remove" className="shrink-0 opacity-0 group-hover/sec:opacity-100 text-[var(--text-faint)] hover:text-red-400 transition-all pr-1">
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
                            </button>
                          </div>
                        );
                      })}
                      {eSections.length === 0 && (
                        <button onClick={handleAddEpilogueSection} className="px-2 py-1 text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-blue)] transition-colors text-left">+ Add Section</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

          </nav>
          )}

          {/* Manuscript TOC */}
          {topTab === "Book" && activeStage === "Manuscript" && (
          <nav className="flex flex-col gap-0.5 text-[13px] px-4 pt-5 pb-4">
            <div className="px-2 pb-2 mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Table of Contents</span>
              <button
                onClick={() => {
                  const allExpanded = chapters.every((ch) => expandedChapters[ch.id] ?? true);
                  const next: Record<string, boolean> = {};
                  for (const ch of chapters) next[ch.id] = !allExpanded;
                  setExpandedChapters(next);
                }}
                title={chapters.every((ch) => expandedChapters[ch.id] ?? true) ? "Collapse all" : "Expand all"}
                className="text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
              >
                {chapters.every((ch) => expandedChapters[ch.id] ?? true) ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,14 12,6 20,14" /><polyline points="4,20 12,12 20,20" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,4 12,12 20,4" /><polyline points="4,10 12,18 20,10" /></svg>
                )}
              </button>
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
            {chapters.map((ch, chIdx) => {
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
                      {formatChapterLabel(ch.title, chIdx)}
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
            <div className="flex shrink-0 items-end gap-1 pr-8 mobile-px-4 mx-6" style={{ overflowX: "auto", paddingTop: 12, paddingBottom: 0, borderBottom: "1px solid var(--border-default)" }}>
              {STAGES.map((stage) => (
                <button key={stage} onClick={() => setActiveStage(stage)} className={`px-3 py-1.5 text-[13px] transition-colors ${activeStage === stage ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--overlay-hover)] hover:text-[var(--text-tertiary)]"}`} style={activeStage === stage ? { border: "1px solid var(--border-subtle)", borderBottom: "2px solid var(--accent-blue)", borderRadius: "6px 6px 0 0", background: "var(--overlay-hover)", marginBottom: -1 } : { border: "1px solid transparent", borderBottom: "2px solid transparent", borderRadius: "6px 6px 0 0", marginBottom: -1 }}>{stage}</button>
              ))}
            </div>
          )}
          {/* ─── Workspace Tab ─── */}
          {topTab === "Workspace" && workspace.mainContent}
          {topTab === "Book" && <div className="flex-1 min-h-0 overflow-hidden flex flex-col pt-6">
          {/* ─── STRUCTURING ─── */}
          {activeStage === "Compose" && selection.type === "structuring" ? (
            <StructuringPage
              aiMessages={aiMessages["structuring"] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage("structuring", updated)}
              onAddAiMessage={(msg) => handleAddAiMessage("structuring", msg)}
              projectId={projectId}
              bookTitle={bookInfo.title || projectName || "this book"}
              mode={projectType}
              stage="structuring"
              projectCtx={structuringProjectCtx}
              workCtx={aiWorkCtx}
              onSendToSynopsis={handleSendToSynopsis}
              onGenerateChapters={handleGenerateChapters}
            />
          ) : activeStage === "Compose" && selection.type === "book_info" ? (
            <BookInfoPage
              bookInfo={bookInfo}
              onChange={handleBookInfoChange}
              aiMessages={aiMessages["book_info"] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage("book_info", updated)}
              onAddAiMessage={(msg) => handleAddAiMessage("book_info", msg)}
              projectId={projectId}
              mode={projectType}
              stage="structuring"
              projectCtx={structuringProjectCtx}
              workCtx={aiWorkCtx}
              onSendToSynopsis={handleSendToSynopsis}
              onGenerateChapters={handleGenerateChapters}
            />
          ) : activeStage === "Compose" && selection.type === "characters" ? (
            <CharactersPage
              bookInfo={bookInfo}
              onChange={handleBookInfoChange}
              aiMessages={aiMessages["characters"] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage("characters", updated)}
              onAddAiMessage={(msg) => handleAddAiMessage("characters", msg)}
              projectId={projectId}
              mode={projectType}
              stage="structuring"
              projectCtx={structuringProjectCtx}
              workCtx={aiWorkCtx}
            />
          ) : activeStage === "Compose" && selection.type === "storyline" ? (
            <StorylinePage
              bookInfo={bookInfo}
              onChange={handleBookInfoChange}
              aiMessages={aiMessages["storyline"] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage("storyline", updated)}
              onAddAiMessage={(msg) => handleAddAiMessage("storyline", msg)}
              projectId={projectId}
              mode={projectType}
              stage="structuring"
              projectCtx={structuringProjectCtx}
              workCtx={aiWorkCtx}
            />
          ) : activeStage === "Compose" && selection.type === "synopsis" ? (
            <SynopsisPage
              bookInfo={bookInfo}
              onChange={handleBookInfoChange}
              aiMessages={aiMessages["synopsis"] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage("synopsis", updated)}
              onAddAiMessage={(msg) => handleAddAiMessage("synopsis", msg)}
              projectId={projectId}
              mode={projectType}
              stage="structuring"
              projectCtx={structuringProjectCtx}
              workCtx={aiWorkCtx}
              onGenerateChapters={handleGenerateChapters}
            />
          ) : activeStage === "Compose" && isWritableSection ? (
            <ComposePage
              sectionTitle={currentSectionTitle}
              chapterId={composeKey}
              composeText={composeTexts[composeKey] ?? ""}
              onComposeChange={(text) => handleComposeChange(composeKey, text)}
              aiMessages={aiMessages[composeKey] ?? []}
              onUpdateAiMessage={(updated) => handleUpdateAiMessage(composeKey, updated)}
              onAddAiMessage={(msg) => handleAddAiMessage(composeKey, msg)}
              projectId={projectId}
              bookTitle={bookInfo.title || projectName || "this book"}
              mode={projectType}
              stage={aiStage}
              projectCtx={aiProjectCtx}
              workCtx={aiWorkCtx}
              status={getSectionStatus(composeKey)}
              onStatusChange={(s) => handleSectionStatusChange(composeKey, s)}
            />

          /* ─── MANUSCRIPT ───
           * Source: composeTexts (from draft_blocks table) — read-only preview of current draft.
           * Does NOT reflect Publish/Final Edit changes. Those live in book_version_sections.
           */
          ) : activeStage === "Manuscript" ? (
            <div className="overflow-y-auto h-full px-8 py-6 mobile-px-4 mobile-show-scrollbar">
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
                    <div className="prose-rendered prose-tight" dangerouslySetInnerHTML={{ __html: cleanManuscriptHtml(composeTexts["prologue"] ?? "") }} />
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
                    <div className="prose-rendered prose-tight" dangerouslySetInnerHTML={{ __html: cleanManuscriptHtml(composeTexts["epilogue"] ?? "") }} />
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
              {/* Mobile tab switcher: Publish | Info */}
              <div className="desktop-hidden flex mb-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
                {([["publish", "Publish"], ["info", "Info"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMobilePublishTab(key)}
                    className="flex-1 pb-2 text-[13px] font-medium transition-colors"
                    style={{
                      color: mobilePublishTab === key ? "var(--text-primary)" : "var(--text-muted)",
                      background: "none",
                      borderTop: "none",
                      borderLeft: "none",
                      borderRight: "none",
                      borderBottomWidth: 2,
                      borderBottomStyle: "solid",
                      borderBottomColor: mobilePublishTab === key ? "var(--accent-blue, #5a9af5)" : "transparent",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Mobile Info tab — shows PublishSidebar content inline */}
              <div className={`desktop-hidden${mobilePublishTab !== "info" ? " mobile-hidden" : ""}`}>
                <PublishSidebar chapters={chapters} composeTexts={composeTexts} bookVersions={bookVersions} bookInfo={bookInfo} selectedVersionId={selectedVersionId} onPreview={(vId) => router.push(`/projects/${projectId}/book/${vId}`)} onExport={(vId) => router.push(`/projects/${projectId}/export/book?version=${vId}`)} onAdapt={() => setShowAdaptModal(true)} />
              </div>

              {/* Publish content (versions table) — hidden on mobile when Info tab active */}
              <div className={mobilePublishTab !== "publish" ? "mobile-hidden" : ""}>
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
                              <th className="pb-2 pr-4 pt-2.5 text-left font-medium mobile-hidden" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Title</th>
                              <th className="pb-2 pr-4 pt-2.5 text-left font-medium mobile-hidden" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Category</th>
                              <th className="pb-2 pr-4 pt-2.5 text-center font-medium mobile-hidden" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Published</th>
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
                                <td className="py-2.5 pr-4 text-[var(--text-secondary)] mobile-hidden">{bookInfo.title || "Untitled"}</td>
                                <td className="py-2.5 pr-4 text-[var(--text-tertiary)] mobile-hidden">{bookInfo.genre || "—"}</td>
                                <td className="py-2.5 pr-4 text-center text-[var(--text-tertiary)] mobile-hidden">{bookInfo.year_published || "—"}</td>
                                <td className="py-2.5 pr-4 text-[var(--text-tertiary)]">{new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                                <td className="py-2.5 pr-1 text-center"><span className={`text-lg ${statusColor}`} title={statusLabel}>&#9679;</span></td>
                                <td className="py-2.5 pr-1 w-10">
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/projects/${projectId}/book/${v.id}`); }} className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-tertiary)]" title="Final Edit">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                  </button>
                                </td>
                                <td className="py-2.5 pr-3.5 w-10">
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/projects/${projectId}/export/book?version=${v.id}`); }} className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-tertiary)]" title="Preview / Export">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
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
              </div>{/* end mobile publish content wrapper */}
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

      {/* Confirm remove section dialog */}
      {confirmRemoveSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmRemoveSection(null)}>
          <div className="w-full max-w-sm mx-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Remove section?</h2>
            <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">
              &ldquo;{confirmRemoveSection.title || "Untitled"}&rdquo; and its content and AI conversations will be permanently deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmRemoveSection(null)} className="rounded-lg border border-[var(--border-default)] px-4 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--overlay-active)] hover:text-[var(--text-primary)]">Cancel</button>
              <button
                onClick={() => {
                  const s = confirmRemoveSection;
                  if (s.kind === "chapter") handleRemoveSection(s.chapterId, s.sectionId);
                  else if (s.kind === "prologue") handleRemovePrologueSection(s.sectionId);
                  else handleRemoveEpilogueSection(s.sectionId);
                  setConfirmRemoveSection(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500"
              >Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
