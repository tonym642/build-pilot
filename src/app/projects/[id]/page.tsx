"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppMode from "./app-mode";


const STAGES = ["Brainstorming", "Compilation", "Draft", "Manuscript", "Book"] as const;
type Stage = (typeof STAGES)[number];

type SectionId = string;

function sectionLabel(s: SectionId): string {
  if (s === "book_info") return "Book Info";
  if (s === "prologue") return "Prologue";
  if (s === "epilogue") return "Epilogue";
  return s;
}

type Message = {
  id: number;
  role: "user" | "ai";
  text: string;
};

type BrainstormChat = {
  id: string;
  chapter: string;
  title: string | null;
  messages: Message[];
  createdAt: Date;
};

type BrainstormChats = Record<string, BrainstormChat[]>;

type CompilationItem = {
  id: string;
  content: string;
  chapter: string;
  createdAt: Date;
  sourceMessageId: number;
  isFavorite: boolean;
};

type DraftBlock = {
  id: string;
  content: string;
  previousContent: string | null;
  sourceCompilationId: string;
  createdAt: Date;
};

type DraftBlocks = Record<string, DraftBlock[]>;

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
      <div className="px-8 py-8 max-w-2xl">
        <h2 className="text-lg font-medium tracking-tight">
          <span className="text-white">Book Info</span>
        </h2>
        <p className="mt-1 text-xs text-white/35">Project metadata — not included in the manuscript.</p>
        <div className="mt-7 flex flex-col gap-6">
          {fields.map(({ key, label, multiline, placeholder }) => (
            <div key={key}>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/35">
                {label}
              </label>
              {multiline ? (
                <textarea
                  rows={3}
                  value={bookInfo[key]}
                  onChange={(e) => onChange({ ...bookInfo, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:border-white/[0.18] focus:outline-none transition-colors"
                />
              ) : (
                <input
                  type="text"
                  value={bookInfo[key]}
                  onChange={(e) => onChange({ ...bookInfo, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:border-white/[0.18] focus:outline-none transition-colors"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const INITIAL_MESSAGES: Message[] = [];

function AiActions({
  isAdded,
  onSendToCompilation,
}: {
  isAdded: boolean;
  onSendToCompilation: () => void;
}) {
  return (
    <div className="mt-2 flex gap-4">
      <button className="text-xs text-white/30 transition-colors hover:text-white/60">Like</button>
      <button className="text-xs text-white/30 transition-colors hover:text-white/60">Favorite</button>
      <button
        onClick={onSendToCompilation}
        disabled={isAdded}
        className={[
          "text-xs transition-colors",
          isAdded ? "text-white/20 cursor-default" : "text-white/30 hover:text-white/60",
        ].join(" ")}
      >
        {isAdded ? "Added" : "Send to Compilation"}
      </button>
    </div>
  );
}

function BrainstormingPanel({
  projectId,
  bookTitle,
  chapter,
  messages,
  activeChatId,
  compilationItems,
  onSendToCompilation,
  onAddMessage,
}: {
  projectId: string;
  bookTitle: string;
  chapter: string;
  messages: Message[];
  activeChatId: string | null;
  compilationItems: CompilationItem[];
  onSendToCompilation: (message: Message, chapter: string) => void;
  onAddMessage: (chatId: string, message: Message) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!showInfo) return;
    function handleClick(e: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showInfo]);

  async function handleSubmit() {
    if (!activeChatId || !input.trim() || loading) return;
    const trimmed = input.trim();
    const userMsg: Message = { id: Date.now(), role: "user", text: trimmed };
    onAddMessage(activeChatId, userMsg);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          chapter,
          bookTitle,
          project_id: projectId,
        }),
      });
      const data = await res.json();
      onAddMessage(activeChatId, {
        id: Date.now() + 1,
        role: "ai",
        text: res.ok && data.reply ? data.reply : "I couldn't generate a response right now. Please try again.",
      });
    } catch {
      onAddMessage(activeChatId, {
        id: Date.now() + 1,
        role: "ai",
        text: "I couldn't generate a response right now. Please try again.",
      });
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

  return (
    <div className="flex h-full flex-col px-8">
      {/* Panel header */}
      <div className="shrink-0 py-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium tracking-tight">
            <span className="text-white">Brainstorming</span>
            <span className="mx-2 text-white/25">/</span>
            <span className="text-zinc-400">{sectionLabel(chapter)}</span>
          </h2>
          {/* Info button + popover */}
          <div className="relative ml-2" ref={infoRef}>
            <button
              onClick={() => setShowInfo((v) => !v)}
              title="How this works"
              className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/30 transition-colors hover:border-white/40 hover:text-white/60"
            >
              i
            </button>
            {showInfo && (
              <div className="absolute left-0 top-6 z-20 w-72 rounded-xl border border-white/[0.09] bg-[#22252d] px-4 py-3 shadow-xl">
                <p className="text-xs leading-relaxed text-white/55">
                  Share an idea, a question, or a direction for this chapter and we&apos;ll develop it together.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/55">
                  You can start broad — a theme, a feeling, or a real story — or specific. Whatever&apos;s on your mind for this chapter.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex max-w-5xl flex-col gap-6 pb-6">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <p className="max-w-[60%] rounded-lg bg-white/[0.07] px-4 py-2.5 text-sm text-white/80 whitespace-pre-line">
                    {msg.text}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm leading-relaxed text-white/70 whitespace-pre-line">
                    {msg.text}
                  </p>
                  <AiActions
                    isAdded={compilationItems.some((item) => item.sourceMessageId === msg.id)}
                    onSendToCompilation={() => onSendToCompilation(msg, chapter)}
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — pinned to bottom of panel */}
      <div className="shrink-0 max-w-5xl py-4">
        <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition-colors focus-within:border-white/[0.18] focus-within:bg-white/[0.05]">
          {/* Left: attach */}
          <button
            type="button"
            aria-label="Attach"
            className="mb-0.5 shrink-0 rounded-full p-1.5 text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/60"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Add an idea, ask a question, or give direction…"
            rows={1}
            style={{ minHeight: "1.5rem", maxHeight: "12.5rem" }}
            className="flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-sm text-white placeholder-white/20 outline-none leading-relaxed"
          />

          {/* Right: mic */}
          <button
            type="button"
            aria-label="Microphone"
            className="mb-0.5 shrink-0 rounded-full p-1.5 text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/60"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
              <path d="M3 7.5A5 5 0 0 0 13 7.5" />
              <line x1="8" y1="12.5" x2="8" y2="15" />
              <line x1="5.5" y1="15" x2="10.5" y2="15" />
            </svg>
          </button>

          {/* Far right: voice OR send */}
          {loading ? (
            <div className="mb-0.5 shrink-0 flex h-7 w-7 items-center justify-center">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            </div>
          ) : input.trim() ? (
            <button
              type="button"
              aria-label="Send"
              onClick={handleSubmit}
              className="mb-0.5 shrink-0 rounded-full bg-white p-1.5 text-black transition-opacity hover:opacity-80"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="13" x2="8" y2="3" />
                <polyline points="4,7 8,3 12,7" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Voice conversation"
              className="mb-0.5 shrink-0 rounded-full p-1.5 text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/60"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M5.5 8c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5" />
                <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function CompilationPanel({
  chapter,
  items,
  draftBlocks,
  onAdd,
  onToggleFavorite,
}: {
  chapter: string;
  items: CompilationItem[];
  draftBlocks: DraftBlocks;
  onAdd: (item: CompilationItem) => void;
  onToggleFavorite: (itemId: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<"all" | "favorites" | "recent">("all");
  const chapterItems = items.filter((item) => item.chapter === chapter);
  const addedSourceIds = new Set((draftBlocks[chapter] ?? []).map((b) => b.sourceCompilationId));

  const filteredItems = (() => {
    if (activeFilter === "favorites") return chapterItems.filter((i) => i.isFavorite);
    if (activeFilter === "recent") return [...chapterItems].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return chapterItems;
  })();

  const filters: { key: "all" | "favorites" | "recent"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "favorites", label: "Favorites" },
    { key: "recent", label: "Recent" },
  ];

  return (
    <div className="flex h-full flex-col px-8">
      <div className="shrink-0 py-5">
        <h2 className="text-lg font-medium tracking-tight">
          <span className="text-white">Compilation</span>
          <span className="mx-2 text-white/25">/</span>
          <span className="text-zinc-400">{sectionLabel(chapter)}</span>
        </h2>
      </div>
      {/* Filter tabs */}
      <div className="shrink-0 flex items-center gap-5 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`text-xs transition-colors ${
              activeFilter === f.key
                ? "text-white"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <p className="mt-2 text-sm text-white/25">
            {activeFilter === "favorites"
              ? "No favorites yet. Click the star on any card to save it here."
              : "No saved ideas yet. Send Brainstorming responses here to start building your compilation."}
          </p>
        ) : (
          <div className="flex max-w-5xl flex-col gap-3 pb-6">
            {filteredItems.map((item) => {
              const isAdded = addedSourceIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-4"
                >
                  <p className="text-sm leading-relaxed text-white/75 whitespace-pre-line">
                    {item.content}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Favorite toggle */}
                      <button
                        onClick={() => onToggleFavorite(item.id)}
                        title={item.isFavorite ? "Unfavorite" : "Favorite"}
                        className="transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill={item.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={item.isFavorite ? "text-amber-400" : "text-white/20 hover:text-white/50"}>
                          <polygon points="7,1 8.9,5.1 13.4,5.5 10.1,8.4 11.1,12.9 7,10.4 2.9,12.9 3.9,8.4 0.6,5.5 5.1,5.1"/>
                        </svg>
                      </button>
                      <span className="text-xs text-white/20">
                        {item.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {isAdded ? (
                      <span className="text-xs text-white/20">Added</span>
                    ) : (
                      <button
                        onClick={() => onAdd(item)}
                        className="text-xs text-white/30 transition-colors hover:text-white/60"
                      >
                        Add to Draft
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftPanel({
  chapter,
  draftBlocks,
  compilationItems,
  onRemove,
  onInsert,
  onEditBlock,
  onReorder,
  onMergeDown,
  onAiAssist,
  onUndo,
}: {
  chapter: string;
  draftBlocks: DraftBlocks;
  compilationItems: CompilationItem[];
  onRemove: (chapter: string, blockId: string) => void;
  onInsert: (item: CompilationItem) => void;
  onEditBlock: (chapter: string, blockId: string, newContent: string) => void;
  onReorder: (chapter: string, blockId: string, direction: "up" | "down") => void;
  onMergeDown: (chapter: string, blockId: string) => void;
  onAiAssist: (chapter: string, blockId: string, action: "rewrite" | "expand" | "shorten") => Promise<void>;
  onUndo: (chapter: string, blockId: string) => void;
}) {
  const blocks = draftBlocks[chapter] ?? [];
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [assistingId, setAssistingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = editTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editingId, editingText]);
  const chapterCompilationItems = compilationItems.filter((item) => item.chapter === chapter);
  const insertedSourceIds = new Set(blocks.map((b) => b.sourceCompilationId));

  function handleInsert(item: CompilationItem) {
    onInsert(item);
    setShowModal(false);
  }

  return (
    <div className="flex h-full flex-col px-8">
      <div className="shrink-0 py-5">
        <h2 className="text-lg font-medium tracking-tight">
          <span className="text-white">Draft</span>
          <span className="mx-2 text-white/25">/</span>
          <span className="text-zinc-400">{sectionLabel(chapter)}</span>
        </h2>
      </div>

      {/* Modal overlay */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/[0.10] bg-[#1c1f26] px-6 py-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Insert from Compilation</h3>
                <p className="mt-0.5 text-xs text-white/40">{chapter}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="2" y1="2" x2="12" y2="12" />
                  <line x1="12" y1="2" x2="2" y2="12" />
                </svg>
              </button>
            </div>

            {/* Modal content */}
            {chapterCompilationItems.length === 0 ? (
              <p className="text-sm text-white/25">No Compilation items for {chapter} yet.</p>
            ) : (
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {chapterCompilationItems.map((item) => {
                  const alreadyIn = insertedSourceIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                    >
                      <p className={[
                        "flex-1 text-sm leading-relaxed",
                        alreadyIn ? "text-white/25" : "text-white/70",
                      ].join(" ")}>
                        {item.content}
                      </p>
                      <div className="shrink-0 pt-0.5">
                        {alreadyIn ? (
                          <span className="text-xs text-white/20">Already in Draft</span>
                        ) : (
                          <button
                            onClick={() => handleInsert(item)}
                            className="text-xs text-white/40 transition-colors hover:text-white/80"
                          >
                            Insert
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mb-4 max-w-3xl">
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/50 transition-colors hover:border-white/[0.16] hover:text-white/70"
          >
            Insert from Compilation
          </button>
        </div>
        {blocks.length === 0 ? (
          <p className="mt-2 text-sm text-white/25">
            No draft content yet. Move ideas from Compilation to start assembling your draft.
          </p>
        ) : (
          <div className="flex max-w-3xl flex-col gap-3 pb-6">
            {blocks.map((block, index) => {
              const isEditing = editingId === block.id;
              const isFirst = index === 0;
              const isLast = index === blocks.length - 1;
              return (
                <div
                  key={block.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-4"
                >
                  {isEditing ? (
                    <>
                      <textarea
                        ref={editTextareaRef}
                        value={editingText}
                        onChange={(e) => {
                          setEditingText(e.target.value);
                          const el = e.target;
                          el.style.height = "auto";
                          el.style.height = `${el.scrollHeight}px`;
                        }}
                        rows={1}
                        style={{ overflow: "hidden" }}
                        className="w-full resize-none bg-white/[0.04] rounded-lg px-3 py-2.5 text-sm leading-relaxed text-white/85 placeholder-white/20 outline-none border border-white/[0.08] focus:border-white/[0.16]"
                      />
                      <div className="mt-2.5 flex items-center justify-end gap-4">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-white/25 transition-colors hover:text-white/50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            onEditBlock(chapter, block.id, editingText);
                            setEditingId(null);
                          }}
                          className="text-xs text-white/60 transition-colors hover:text-white/90"
                        >
                          Save
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-line">
                        {block.content}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-white/20">
                          {block.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })} &middot;{" "}
                          {block.createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <div className="flex items-center gap-3">
                          {/* ── Up / Down / Merge (reorder) ── */}
                          {!isFirst && (
                            <button
                              onClick={() => onReorder(chapter, block.id, "up")}
                              title="Move up"
                              className="text-white/20 transition-colors hover:text-white/50"
                            >
                              {/* Up arrow */}
                              <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="11" x2="7" y2="3"/><polyline points="4,6 7,3 10,6"/></svg>
                              </button>
                          )}
                          {!isLast && (
                            <button
                              onClick={() => onReorder(chapter, block.id, "down")}
                              title="Move down"
                              className="text-white/20 transition-colors hover:text-white/50"
                            >
                              {/* Down arrow */}
                              <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="3" x2="7" y2="11"/><polyline points="4,8 7,11 10,8"/></svg>
                              </button>
                          )}
                          {!isLast && (
                            <button
                              onClick={() => onMergeDown(chapter, block.id)}
                              title="Merge down"
                              className="text-white/20 transition-colors hover:text-white/50"
                            >
                              {/* Merge icon: two lines joining */}
                              <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2 L7 7 L11 2"/><line x1="7" y1="7" x2="7" y2="12"/></svg>
                              </button>
                          )}

                          {/* ── AI actions ── */}
                          {assistingId === block.id ? (
                            <span className="text-xs text-white/25">Working…</span>
                          ) : (
                            <>
                              {(["Rewrite", "Expand", "Shorten"] as const).map((action) => {
                                const icons: Record<string, React.ReactNode> = {
                                  Rewrite: <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7 Q4 2 7 4 Q10 6 11 3"/><polyline points="9,2 11,3 10,5"/></svg>,
                                  Expand:  <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>,
                                  Shorten: <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="4" x2="11" y2="4"/><line x1="3" y1="7" x2="9" y2="7"/><line x1="3" y1="10" x2="6" y2="10"/></svg>,
                                };
                                return (
                                  <button
                                    key={action}
                                    onClick={async () => {
                                      setAssistingId(block.id);
                                      await onAiAssist(chapter, block.id, action.toLowerCase() as "rewrite" | "expand" | "shorten");
                                      setAssistingId(null);
                                    }}
                                    disabled={!!assistingId}
                                    title={`Ai ${action.toLowerCase()}`}
                                    className="text-white/20 transition-colors hover:text-white/50 disabled:opacity-40"
                                  >
                                    {icons[action]}
                                    </button>
                                );
                              })}
                              {block.previousContent !== null && (
                                <button
                                  onClick={() => onUndo(chapter, block.id)}
                                  title="Undo"
                                  className="text-white/20 transition-colors hover:text-white/50"
                                >
                                  {/* Undo arrow */}
                                  <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7 Q3 3 8 3 Q12 3 12 7 Q12 11 8 11 L5 11"/><polyline points="3,9 3,7 5,7"/></svg>
                                  </button>
                              )}
                            </>
                          )}

                          {/* ── Edit / Remove ── */}
                          <button
                            onClick={() => { setEditingId(block.id); setEditingText(block.content); }}
                            title="Edit"
                            className="text-white/20 transition-colors hover:text-white/50"
                          >
                            {/* Pencil */}
                            <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2.5 L11.5 4.5 L5 11 L2 12 L3 9 Z"/><line x1="8" y1="4" x2="10" y2="6"/></svg>
                            </button>
                          {confirmRemoveId === block.id ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-white/40">Remove?</span>
                              <button
                                onClick={() => { onRemove(chapter, block.id); setConfirmRemoveId(null); }}
                                className="text-xs text-red-400/70 transition-colors hover:text-red-400"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                className="text-xs text-white/20 transition-colors hover:text-white/50"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveId(block.id)}
                              title="Remove"
                              className="text-white/20 transition-colors hover:text-white/50"
                            >
                              {/* Trash */}
                              <svg className="" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,4 11,4"/><path d="M5 4 L5 11 Q5 12 6 12 L8 12 Q9 12 9 11 L9 4"/><path d="M5.5 4 L5.5 2.5 Q5.5 2 6 2 L8 2 Q8.5 2 8.5 2.5 L8.5 4"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectName, setProjectName] = useState<string>("");
  const [projectType, setProjectType] = useState<string>("Book");
  const [activeStage, setActiveStage] = useState<Stage>(() => {
    const stageParam = searchParams.get("stage");
    if (stageParam && STAGES.includes(stageParam as Stage)) return stageParam as Stage;
    return "Brainstorming";
  });
  const [activeSection, setActiveSection] = useState<SectionId>("Chapter 1");
  const [chapters, setChapters] = useState<string[]>(["Chapter 1", "Chapter 2", "Chapter 3"]);
  const [confirmRemoveChapter, setConfirmRemoveChapter] = useState<string | null>(null);
  const [brainstormChats, setBrainstormChats] = useState<BrainstormChats>({});
  const [activeChatIds, setActiveChatIds] = useState<Record<string, string>>({});
  const [compilationItems, setCompilationItems] = useState<CompilationItem[]>([]);
  const [draftBlocks, setDraftBlocks] = useState<DraftBlocks>({});
  const [bookInfo, setBookInfo] = useState<BookInfo>(EMPTY_BOOK_INFO);
  const [bookStructure, setBookStructure] = useState<{ id: string; type: string; title: string; position: number }[]>([]);
  const [bookVersions, setBookVersions] = useState<{ id: string; version_number: number; source: string; status: string; created_at: string; derived_status?: string }[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);

  // Load project record via API
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

  // Load persisted messages from Supabase on mount
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

      const newChats: BrainstormChats = {};
      const newChatIds: Record<string, string> = {};

      for (const [chapter, rows] of Object.entries(grouped)) {
        const chatId = crypto.randomUUID();
        const messages: Message[] = rows.map((row, i) => ({
          id: i + 1,
          role: (row.role === "assistant" ? "ai" : "user") as Message["role"],
          text: row.message,
        }));
        const chat: BrainstormChat = {
          id: chatId,
          chapter,
          title: null,
          messages,
          createdAt: new Date(rows[0].created_at),
        };
        newChats[chapter] = [chat];
        newChatIds[chapter] = chatId;
      }

      // Merge: Supabase data wins for chapters that have no user-sent messages yet
      setBrainstormChats((prev) => {
        const merged: BrainstormChats = { ...prev };
        for (const [chapter, chatList] of Object.entries(newChats)) {
          const existingHasContent = (merged[chapter] ?? []).some((c) => c.messages.length > 0);
          if (!existingHasContent) {
            merged[chapter] = chatList;
          }
        }
        return merged;
      });
      setActiveChatIds((prev) => {
        const merged = { ...prev };
        for (const [chapter, chatId] of Object.entries(newChatIds)) {
          if (!prev[chapter]) {
            merged[chapter] = chatId;
          }
        }
        return merged;
      });
      setMessagesLoaded(true);
    }
    loadMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load compilation items from Supabase on mount
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/compilations`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const items: CompilationItem[] = data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            content: row.content as string,
            chapter: row.chapter as string,
            createdAt: new Date(row.created_at as string),
            sourceMessageId: (row.source_message_id as number) ?? 0,
            isFavorite: (row.is_favorite as boolean) ?? false,
          }));
          setCompilationItems(items);
        }
      });
  }, [projectId]);

  // Load draft blocks from Supabase on mount
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/drafts`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const grouped: DraftBlocks = {};
          for (const row of data) {
            const chapter = row.chapter as string;
            if (!grouped[chapter]) grouped[chapter] = [];
            grouped[chapter].push({
              id: row.id as string,
              content: row.content as string,
              previousContent: (row.previous_content as string) ?? null,
              sourceCompilationId: (row.source_compilation_id as string) ?? "",
              createdAt: new Date(row.created_at as string),
            });
          }
          setDraftBlocks(grouped);
        }
      });
  }, [projectId]);

  // Auto-save compilation items (debounced)
  const compilationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compilationLoadedRef = useRef(false);

  useEffect(() => {
    // Skip the initial load-triggered update
    if (!compilationLoadedRef.current) {
      compilationLoadedRef.current = true;
      return;
    }
    if (compilationTimerRef.current) clearTimeout(compilationTimerRef.current);
    compilationTimerRef.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/compilations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: compilationItems }),
      });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compilationItems]);

  // Auto-save draft blocks (debounced)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    // Skip the initial load-triggered update
    if (!draftLoadedRef.current) {
      draftLoadedRef.current = true;
      return;
    }
    // Flatten draftBlocks into array with chapter info
    const allBlocks: Record<string, unknown>[] = [];
    for (const [chapter, blocks] of Object.entries(draftBlocks)) {
      for (const block of blocks) {
        allBlocks.push({ ...block, chapter });
      }
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/drafts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: allBlocks }),
      });
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftBlocks]);

  // Load book structure from Supabase on mount, repair ordering
  useEffect(() => {
    if (!projectId) return;
    // Repair positions first, then load
    fetch(`/api/projects/${projectId}/structure`, { method: "PATCH" })
      .then(() => fetch(`/api/projects/${projectId}/structure`))
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = [...data].sort(
            (a: { position?: number }, b: { position?: number }) =>
              (a.position ?? 0) - (b.position ?? 0)
          );
          setBookStructure(sorted);
        }
      });
  }, [projectId]);

  // Load book versions from Supabase on mount
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

  // Auto-create or restore chat when entering Brainstorming for a section
  useEffect(() => {
    if (!messagesLoaded) return;
    if (activeStage !== "Brainstorming") return;
    const sectionChats = brainstormChats[activeSection] ?? [];
    if (sectionChats.length === 0) {
      const chat: BrainstormChat = {
        id: crypto.randomUUID(),
        chapter: activeSection,
        title: null,
        messages: [...INITIAL_MESSAGES],
        createdAt: new Date(),
      };
      setBrainstormChats((prev) => ({ ...prev, [activeSection]: [chat] }));
      setActiveChatIds((prev) => ({ ...prev, [activeSection]: chat.id }));
    } else if (!activeChatIds[activeSection]) {
      const latest = [...sectionChats].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      setActiveChatIds((prev) => ({ ...prev, [activeSection]: latest.id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStage, activeSection, messagesLoaded]);

  // Save book info to Supabase with debounce
  const bookInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBookInfoChange = useCallback((updated: BookInfo) => {
    setBookInfo(updated);
    if (bookInfoTimerRef.current) clearTimeout(bookInfoTimerRef.current);
    bookInfoTimerRef.current = setTimeout(() => {
      fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId, book_info: updated }),
      });
    }, 800);
  }, [projectId]);

  function handleNewBrainstormChat(chapter: string) {
    const chat: BrainstormChat = {
      id: crypto.randomUUID(),
      chapter,
      title: null,
      messages: [...INITIAL_MESSAGES],
      createdAt: new Date(),
    };
    setBrainstormChats((prev) => ({ ...prev, [chapter]: [...(prev[chapter] ?? []), chat] }));
    setActiveChatIds((prev) => ({ ...prev, [chapter]: chat.id }));
  }

  function handleSelectBrainstormChat(chapter: string, chatId: string) {
    setActiveChatIds((prev) => ({ ...prev, [chapter]: chatId }));
  }

  function handleAddBrainstormMessage(chapter: string, chatId: string, message: Message) {
    setBrainstormChats((prev) => ({
      ...prev,
      [chapter]: (prev[chapter] ?? []).map((c) => {
        if (c.id !== chatId) return c;
        if (c.messages.some((m) => m.id === message.id)) return c;
        return { ...c, messages: [...c.messages, message] };
      }),
    }));
  }

  function handleSendToCompilation(message: Message, chapter: string) {
    const alreadyAdded = compilationItems.some((item) => item.sourceMessageId === message.id);
    if (alreadyAdded) return;
    setCompilationItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        content: message.text,
        chapter,
        createdAt: new Date(),
        sourceMessageId: message.id,
        isFavorite: false,
      },
    ]);
  }

  function handleToggleFavorite(itemId: string) {
    setCompilationItems((prev) =>
      prev.map((item) => item.id === itemId ? { ...item, isFavorite: !item.isFavorite } : item)
    );
  }

  function handleMoveToDraft(selectedItems: CompilationItem[]) {
    if (selectedItems.length === 0) return;
    setDraftBlocks((prev) => {
      const chapter = selectedItems[0].chapter;
      const existing = prev[chapter] ?? [];
      const existingSourceIds = new Set(existing.map((b) => b.sourceCompilationId));
      const newBlocks: DraftBlock[] = selectedItems
        .filter((item) => !existingSourceIds.has(item.id))
        .map((item) => ({
          id: crypto.randomUUID(),
          content: item.content,
          previousContent: null,
          sourceCompilationId: item.id,
          createdAt: new Date(),
        }));
      return { ...prev, [chapter]: [...existing, ...newBlocks] };
    });
  }

  function handleInsertIntoDraft(item: CompilationItem) {
    setDraftBlocks((prev) => {
      const existing = prev[item.chapter] ?? [];
      if (existing.some((b) => b.sourceCompilationId === item.id)) return prev;
      return {
        ...prev,
        [item.chapter]: [
          ...existing,
          {
            id: crypto.randomUUID(),
            content: item.content,
            previousContent: null,
            sourceCompilationId: item.id,
            createdAt: new Date(),
          },
        ],
      };
    });
  }

  async function handleAiAssistBlock(
    chapter: string,
    blockId: string,
    action: "rewrite" | "expand" | "shorten"
  ) {
    const block = (draftBlocks[chapter] ?? []).find((b) => b.id === blockId);
    if (!block) return;
    try {
      const res = await fetch("/api/draft-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: block.content, action, chapter, bookTitle: projectName || bookInfo.title || "this book" }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setDraftBlocks((prev) => ({
          ...prev,
          [chapter]: (prev[chapter] ?? []).map((b) =>
            b.id === blockId ? { ...b, previousContent: b.content, content: data.result } : b
          ),
        }));
      }
    } catch {
      // silently fail — block content unchanged
    }
  }

  function handleUndoBlock(chapter: string, blockId: string) {
    setDraftBlocks((prev) => ({
      ...prev,
      [chapter]: (prev[chapter] ?? []).map((b) =>
        b.id === blockId && b.previousContent !== null
          ? { ...b, content: b.previousContent, previousContent: null }
          : b
      ),
    }));
  }

  function handleMergeBlock(chapter: string, blockId: string) {
    setDraftBlocks((prev) => {
      const arr = [...(prev[chapter] ?? [])];
      const idx = arr.findIndex((b) => b.id === blockId);
      if (idx === -1 || idx >= arr.length - 1) return prev;
      const merged: DraftBlock = {
        ...arr[idx],
        content: arr[idx].content + "\n\n" + arr[idx + 1].content,
      };
      arr.splice(idx, 2, merged);
      return { ...prev, [chapter]: arr };
    });
  }

  function handleReorderBlock(chapter: string, blockId: string, direction: "up" | "down") {
    setDraftBlocks((prev) => {
      const arr = [...(prev[chapter] ?? [])];
      const idx = arr.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return { ...prev, [chapter]: arr };
    });
  }

  function handleEditBlock(chapter: string, blockId: string, newContent: string) {
    setDraftBlocks((prev) => ({
      ...prev,
      [chapter]: (prev[chapter] ?? []).map((b) =>
        b.id === blockId ? { ...b, content: newContent } : b
      ),
    }));
  }

  function handleRemoveFromDraft(chapter: string, blockId: string) {
    setDraftBlocks((prev) => ({
      ...prev,
      [chapter]: (prev[chapter] ?? []).filter((b) => b.id !== blockId),
    }));
  }

  function handleAddChapter() {
    setChapters((prev) => {
      const next = prev.length + 1;
      return [...prev, `Chapter ${next}`];
    });
  }

  async function loadBookStructure() {
    const res = await fetch(`/api/projects/${projectId}/structure`);
    const data = await res.json();
    if (Array.isArray(data)) {
      const sorted = [...data].sort(
        (a: { position?: number }, b: { position?: number }) =>
          (a.position ?? 0) - (b.position ?? 0)
      );
      setBookStructure(sorted);
    }
  }

  async function handleAddStructureChapter() {
    const res = await fetch(`/api/projects/${projectId}/structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "chapter" }),
    });
    if (res.ok) {
      await loadBookStructure();
    }
  }

  const [sendingToBook, setSendingToBook] = useState(false);
  const [sendToBookSuccess, setSendToBookSuccess] = useState(false);

  async function handleSendToBook() {
    setSendingToBook(true);
    setSendToBookSuccess(false);

    // Gather all manuscript sections in order (exclude book_info — internal only)
    const orderedSections = ["prologue", ...chapters, "epilogue"];
    const sections: { section_type: string; section_title: string; position: number; content: string }[] = [];
    let position = 0;

    for (const s of orderedSections) {
      const blocks = draftBlocks[s] ?? [];
      if (blocks.length > 0) {
        const type = s === "prologue" ? "prologue" : s === "epilogue" ? "epilogue" : "chapter";
        sections.push({
          section_type: type,
          section_title: sectionLabel(s),
          position: position++,
          content: blocks.map((b) => b.content).join("\n\n"),
        });
      }
    }

    const res = await fetch(`/api/projects/${projectId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });

    if (res.ok) {
      setSendToBookSuccess(true);
      await loadBookVersions();
      setTimeout(() => setSendToBookSuccess(false), 3000);
    }

    setSendingToBook(false);
  }

  function handleConfirmRemoveChapter(chapter: string) {
    const remaining = chapters.filter((c) => c !== chapter);
    setChapters(remaining);
    setBrainstormChats((prev) => { const n = { ...prev }; delete n[chapter]; return n; });
    setActiveChatIds((prev) => { const n = { ...prev }; delete n[chapter]; return n; });
    setCompilationItems((prev) => prev.filter((item) => item.chapter !== chapter));
    setDraftBlocks((prev) => { const n = { ...prev }; delete n[chapter]; return n; });
    setActiveSection((prev) => (prev === chapter ? (remaining[0] ?? "prologue") : prev));
    setConfirmRemoveChapter(null);
  }

  const [isChaptersOpen, setIsChaptersOpen] = useState(true);

  // Render App mode for App projects
  if (projectType === "App") {
    return <AppMode projectId={projectId} projectName={projectName} />;
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
      {/* Stage navigation */}
      <div className="flex shrink-0 gap-1 border-b border-white/[0.07] px-8 pb-3">
        {STAGES.map((stage) => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={[
              "rounded-t px-3 pb-3.5 pt-3 text-sm transition-colors",
              activeStage === stage
                ? "border-b-2 border-white font-medium text-white"
                : "text-white/35 hover:bg-white/[0.04] hover:text-white/65",
            ].join(" ")}
          >
            {stage}
          </button>
        ))}
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — editing nav for writing stages, reader nav for Manuscript/Book */}
        {activeStage !== "Manuscript" && activeStage !== "Book" ? (
        <aside className="w-52 shrink-0 border-r border-white/[0.07] px-4 py-5 overflow-y-auto" key="edit-sidebar">
          {/* Book identity */}
          <div className="mb-4 px-2">
            <p className="text-sm font-semibold tracking-tight text-white/90">{projectName || bookInfo.title || "Untitled Project"}</p>
            <p className="mt-0.5 text-xs text-white/35">{bookInfo.author || "\u00A0"}</p>
          </div>
          <div className="mb-4 border-t border-white/[0.07]" />

          <nav className="flex flex-col gap-1 text-sm">
            {/* Book Info */}
            <button
              onClick={() => setActiveSection("book_info")}
              className={[
                "w-full rounded px-2 py-1.5 text-left text-sm transition-colors",
                activeSection === "book_info" ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white/80",
              ].join(" ")}
            >
              Book Info
            </button>

            {/* Prologue */}
            <button
              onClick={() => setActiveSection("prologue")}
              className={[
                "w-full rounded px-2 py-1.5 text-left text-sm transition-colors",
                activeSection === "prologue" ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white/80",
              ].join(" ")}
            >
              Prologue
            </button>

            {/* Chapters — collapsible group */}
            <div className="mt-1">
              <div className="flex w-full items-center justify-between px-2 py-1">
                <button
                  onClick={() => setIsChaptersOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors"
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
                  className="text-white/25 hover:text-white/60 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="6" y1="1" x2="6" y2="11" />
                    <line x1="1" y1="6" x2="11" y2="6" />
                  </svg>
                </button>
              </div>
              {isChaptersOpen && (
                <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                  {chapters.map((ch) => (
                    <div key={ch} className="group flex items-center">
                      <button
                        onClick={() => setActiveSection(ch)}
                        className={[
                          "flex-1 rounded-l px-2 py-1.5 text-left text-sm transition-colors",
                          activeSection === ch ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white/80",
                        ].join(" ")}
                      >
                        {ch}
                      </button>
                      <button
                        onClick={() => setConfirmRemoveChapter(ch)}
                        title={`Remove ${ch}`}
                        className="pr-1 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <line x1="1" y1="1" x2="9" y2="9" />
                          <line x1="9" y1="1" x2="1" y2="9" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Epilogue */}
            <button
              onClick={() => setActiveSection("epilogue")}
              className={[
                "mt-1 w-full rounded px-2 py-1.5 text-left text-sm transition-colors",
                activeSection === "epilogue" ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white/80",
              ].join(" ")}
            >
              Epilogue
            </button>
          </nav>
        </aside>
        ) : activeStage === "Manuscript" ? (
        <aside className="w-52 shrink-0 border-r border-white/[0.07] px-4 py-5 overflow-y-auto">
          {/* Book identity */}
          <div className="mb-4 px-2">
            <p className="text-sm font-semibold tracking-tight text-white/90">{projectName || bookInfo.title || "Untitled Project"}</p>
            <p className="mt-0.5 text-xs text-white/35">{bookInfo.author || "\u00A0"}</p>
          </div>
          <div className="mb-4 border-t border-white/[0.07]" />

          {/* Reader navigation */}
          <nav className="flex flex-col gap-0.5 text-sm">
            {(["prologue", ...chapters, "epilogue"])
              .filter((s) => (draftBlocks[s] ?? []).length > 0)
              .map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    document.getElementById(`manuscript-section-${s}`)?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="w-full rounded px-2 py-1.5 text-left text-sm text-white/50 transition-colors hover:text-white/80"
                >
                  {sectionLabel(s)}
                </button>
              ))}
            {(["prologue", ...chapters, "epilogue"]).every(
              (s) => (draftBlocks[s] ?? []).length === 0
            ) && (
              <p className="px-2 text-xs text-white/25">No sections yet.</p>
            )}
          </nav>
        </aside>
        ) : null}

        {/* Main content */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {activeSection === "book_info" ? (
            <BookInfoPanel bookInfo={bookInfo} onChange={handleBookInfoChange} />
          ) : activeStage === "Brainstorming" ? (
            <BrainstormingPanel
              chapter={activeSection}
              projectId={projectId}
              bookTitle={projectName || bookInfo.title || "this book"}
              messages={(brainstormChats[activeSection] ?? []).find((c) => c.id === activeChatIds[activeSection])?.messages ?? []}
              activeChatId={activeChatIds[activeSection] ?? null}
              compilationItems={compilationItems}
              onAddMessage={(chatId, message) => handleAddBrainstormMessage(activeSection, chatId, message)}
              onSendToCompilation={handleSendToCompilation}
            />
          ) : activeStage === "Compilation" ? (
            <CompilationPanel
              chapter={activeSection}
              items={compilationItems}
              draftBlocks={draftBlocks}
              onAdd={handleInsertIntoDraft}
              onToggleFavorite={handleToggleFavorite}
            />
          ) : activeStage === "Draft" ? (
            <DraftPanel
              chapter={activeSection}
              draftBlocks={draftBlocks}
              compilationItems={compilationItems}
              onRemove={handleRemoveFromDraft}
              onInsert={handleInsertIntoDraft}
              onEditBlock={handleEditBlock}
              onReorder={handleReorderBlock}
              onMergeDown={handleMergeBlock}
              onAiAssist={handleAiAssistBlock}
              onUndo={handleUndoBlock}
            />
          ) : activeStage === "Manuscript" ? (
            <div className="overflow-y-auto h-full">
              <div className="mx-auto max-w-3xl px-4 py-10">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-semibold">Manuscript</h2>
                  <div className="flex items-center gap-3">
                    {sendToBookSuccess && (
                      <span className="text-sm text-green-400">Snapshot saved!</span>
                    )}
                    <button
                      onClick={handleSendToBook}
                      disabled={sendingToBook}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-40"
                    >
                      {sendingToBook ? "Saving..." : "Send to Book"}
                    </button>
                  </div>
                </div>
                {(["prologue", ...chapters, "epilogue"])
                  .filter((s) => (draftBlocks[s] ?? []).length > 0)
                  .map((s) => (
                      <div key={s} id={`manuscript-section-${s}`} className="mb-12">
                        <h2 className="text-2xl font-semibold mb-4">{sectionLabel(s)}</h2>
                        <div className="space-y-6">
                          {(draftBlocks[s] ?? []).map((block) => {
                            const paragraphs = block.content
                              .split(/\n\s*\n/)
                              .map((p) => p.trim())
                              .filter(Boolean);
                            return (
                              <div key={block.id} className="space-y-4">
                                {paragraphs.map((para, i) => (
                                  <p key={i} className="text-zinc-300 leading-7">{para}</p>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                  ))
                }
                {(["prologue", ...chapters, "epilogue"]).every((s) => (draftBlocks[s] ?? []).length === 0) && (
                  <p className="text-sm text-white/30">
                    Your manuscript will appear here once you add content in the Draft stage.
                  </p>
                )}
              </div>
            </div>
          ) : activeStage === "Book" ? (
            <div className="overflow-y-auto h-full px-8 py-10">
              <h2 className="text-2xl font-semibold tracking-tight mb-1">Book Versions</h2>
              <p className="text-sm text-white/40 mb-6">Snapshots of your manuscript</p>
              {bookVersions.length === 0 ? (
                <p className="text-sm text-white/30">
                  No versions yet. Use &ldquo;Send to Book&rdquo; from the Manuscript stage to create a snapshot.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-widest text-white/30">
                      <th className="pb-3 pr-1 font-medium w-10"></th>
                      <th className="pb-3 pr-1 font-medium w-10"></th>
                      <th className="pb-3 pr-6 font-medium">Version</th>
                      <th className="pb-3 pr-6 font-medium">Date</th>
                      <th className="pb-3 pr-6 font-medium">Source</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {bookVersions.map((v) => {
                      const ds = v.derived_status ?? v.status;
                      const statusLabel = ds === "finalized" ? "Finalized" : ds === "in_progress" ? "In Progress" : "Pending";
                      const statusColor = ds === "finalized" ? "text-green-400" : ds === "in_progress" ? "text-yellow-400" : "text-red-400/60";
                      return (
                      <tr
                        key={v.id}
                        className="group transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="py-3.5 pr-1 w-10">
                          <button
                            onClick={() => router.push(`/projects/${projectId}/book/${v.id}`)}
                            className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                            title="Final Edit"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </td>
                        <td className="py-3.5 pr-1 w-10">
                          <button
                            onClick={() => console.log("Print PDF - version:", v.id)}
                            className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                            title="Print PDF"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9V2h12v7" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect x="6" y="14" width="12" height="8" />
                            </svg>
                          </button>
                        </td>
                        <td className="py-3.5 pr-6 font-medium text-white/90">
                          Version {v.version_number}
                        </td>
                        <td className="py-3.5 pr-6 text-white/50">
                          {new Date(v.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3.5 pr-6 text-white/50 capitalize">
                          {v.source} snapshot
                        </td>
                        <td className="py-3.5">
                          <span className={`text-lg ${statusColor}`} title={statusLabel}>&#9679;</span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="overflow-y-auto h-full px-8 py-6">
              <p className="text-sm text-white/30">
                Select a stage above.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm remove chapter dialog */}
      {confirmRemoveChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-white">Remove {confirmRemoveChapter}?</h2>
            <p className="mt-2 text-sm text-white/50">
              All data created in this chapter — brainstorms, compiled ideas, and draft content — will be permanently deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemoveChapter(null)}
                className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmRemoveChapter(confirmRemoveChapter)}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
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
