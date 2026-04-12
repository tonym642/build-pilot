"use client";

/**
 * ─── SOURCE OF TRUTH: Final Edit (Publish) Page ───────────────────
 *
 * WORKFLOW:
 *   Compose  → drafting/editing source         → writes to `draft_blocks` table
 *   Manuscript → compiled preview (read-only)  → reads from `draft_blocks` via composeTexts
 *   Publish  → final proofing/finalized version → reads/writes `book_version_sections` table
 *
 * DATA FLOW:
 *   "Send to Publish" snapshots composeTexts → creates `book_versions` + `book_version_sections`
 *   Each version is an independent frozen copy. Edits here do NOT affect Compose or Manuscript.
 *
 * PERSISTENCE:
 *   - Section content edits   → PATCH /api/projects/{id}/versions/{versionId} → book_version_sections.content
 *   - Review status           → PATCH → book_version_sections.is_reviewed, reviewed_at
 *   - Finalize status         → PATCH → book_version_sections.is_finalized, finalized_at
 *   - AI suggestion accept    → PATCH → book_version_sections.content (with undo snapshot)
 *
 * MANUSCRIPT RELATION:
 *   Manuscript = pre-publish compiled content ONLY (reads from composeTexts/draft_blocks).
 *   It does NOT reflect finalized publish content. Publish is a one-way snapshot.
 */

import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RichTextEditor } from "@/components/editor/rich-text-editor";

type Section = {
  id: string;
  section_type: string;
  section_title: string;
  position: number;
  content: string;
  is_reviewed: boolean | null;
  is_finalized: boolean | null;
  reviewed_at: string | null;
  finalized_at: string | null;
};

type Version = {
  id: string;
  version_number: number;
  source: string;
  status: string;
  created_at: string;
};

type Suggestion = {
  original_text: string;
  suggested_text: string;
  reason: string;
};

type SuggestionState = Suggestion & {
  status: "pending" | "accepted" | "edited" | "skipped";
  editedText: string | null;
  previousContent: string | null;
};

type ReviewState = "not_started" | "in_progress" | "loaded" | "complete";

type FinalizeModal = null | "no_review" | "pending_suggestions";

export default function FinalEditPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id: projectId, versionId } = use(params);
  const router = useRouter();
  const [version, setVersion] = useState<Version | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // AI proofing state — per active section
  const [suggestions, setSuggestions] = useState<SuggestionState[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>("not_started");

  // Finalize confirmation modal
  const [finalizeModal, setFinalizeModal] = useState<FinalizeModal>(null);

  // Sidebar chapter expand/collapse
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  const backRoute = `/projects/${projectId}?stage=Publish`;

  // Load version and sections
  useEffect(() => {
    fetch(`/api/projects/${projectId}/versions/${versionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.version) setVersion(data.version);
        if (Array.isArray(data.sections)) {
          const sorted = [...data.sections]
            .filter((s: Section) => s.section_type !== "info")
            .sort((a: Section, b: Section) => a.position - b.position);
          setSections(sorted);
          const firstUnfinished = sorted.find((s: Section) => !s.is_finalized);
          const defaultSection = firstUnfinished ?? sorted[0];
          if (defaultSection) {
            setActiveSectionId(defaultSection.id);
            console.log("active section id:", defaultSection.id);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, versionId]);

  // Derived values
  const activeIndex = sections.findIndex((s) => s.id === activeSectionId);
  const activeSectionData = activeIndex >= 0 ? sections[activeIndex] : null;
  const totalSections = sections.length;
  const reviewedCount = sections.filter((s) => s.is_reviewed).length;
  const finalizedCount = sections.filter((s) => s.is_finalized).length;

  const totalSuggestions = suggestions.length;
  const handledCount = suggestions.filter((s) => s.status !== "pending").length;
  const pendingCount = totalSuggestions - handledCount;

  // AI review status label
  const aiStatusLabel =
    reviewState === "not_started"
      ? "AI Review: Not started"
      : reviewState === "in_progress"
      ? "AI Review: In progress..."
      : pendingCount > 0
      ? `AI Review: ${handledCount} of ${totalSuggestions} handled`
      : totalSuggestions > 0
      ? "AI Review: Complete"
      : "AI Review: Complete (no issues)";

  console.log("review state:", reviewState, "total suggestions:", totalSuggestions, "handled suggestions:", handledCount);

  // Section navigation — flush pending saves, then reset suggestions for new section
  function goToSection(sectionId: string) {
    flushPendingSaves();
    setActiveSectionId(sectionId);
    setSuggestions([]);
    setEditingIndex(null);
    setFinalizeModal(null);
    // Determine review state from persisted is_reviewed
    const section = sections.find((s) => s.id === sectionId);
    setReviewState(section?.is_reviewed ? "loaded" : "not_started");
    console.log("[Publish Nav] section:", sectionId, "index:", sections.findIndex((s) => s.id === sectionId));
  }

  function goPrev() {
    if (activeIndex > 0) goToSection(sections[activeIndex - 1].id);
  }

  function goNext() {
    if (activeIndex < sections.length - 1) goToSection(sections[activeIndex + 1].id);
  }

  // Debounced save — per-section timers to avoid cross-section cancellation
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSavesRef = useRef<Record<string, Record<string, unknown>>>({});

  const patchSection = useCallback(
    (sectionId: string, payload: Record<string, unknown>) => {
      // Source: book_version_sections table via PATCH /api/projects/{id}/versions/{versionId}
      console.log("[Publish Save] section_id:", sectionId, "payload:", payload);
      delete pendingSavesRef.current[sectionId];
      fetch(`/api/projects/${projectId}/versions/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sectionId, ...payload }),
      }).then((res) => {
        if (!res.ok) console.error("[Publish Save] error:", res.status);
        else console.log("[Publish Save] saved successfully:", sectionId);
      });
    },
    [projectId, versionId]
  );

  // Flush any pending saves (called before navigation or section switch)
  const flushPendingSaves = useCallback(() => {
    for (const [sectionId, payload] of Object.entries(pendingSavesRef.current)) {
      if (saveTimersRef.current[sectionId]) {
        clearTimeout(saveTimersRef.current[sectionId]);
        delete saveTimersRef.current[sectionId];
      }
      patchSection(sectionId, payload);
    }
  }, [patchSection]);

  // Flush on unmount (e.g. navigating away)
  useEffect(() => {
    return () => { flushPendingSaves(); };
  }, [flushPendingSaves]);

  const handleSectionContentChange = useCallback(
    (sectionId: string, content: string) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, content } : s))
      );
      // Track pending save and debounce per-section
      pendingSavesRef.current[sectionId] = { content };
      if (saveTimersRef.current[sectionId]) clearTimeout(saveTimersRef.current[sectionId]);
      saveTimersRef.current[sectionId] = setTimeout(() => patchSection(sectionId, { content }), 800);
    },
    [patchSection]
  );

  // AI Review
  async function handleReviewSection() {
    if (!activeSectionData || activeSectionData.section_type === "info") return;

    console.log("selected section:", activeSectionData.section_title, activeSectionData.id);
    setReviewing(true);
    setReviewState("in_progress");
    setSuggestions([]);
    setEditingIndex(null);

    const payload = {
      content: activeSectionData.content,
      section_title: activeSectionData.section_title,
    };
    console.log("AI request payload:", payload);

    try {
      const res = await fetch("/api/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("AI response:", data);

      if (Array.isArray(data.suggestions)) {
        setSuggestions(
          data.suggestions.map((s: Suggestion) => ({
            ...s,
            status: "pending" as const,
            editedText: null,
            previousContent: null,
          }))
        );
        setReviewState(data.suggestions.length === 0 ? "complete" : "loaded");
      } else {
        setReviewState("complete");
      }

      // Mark as reviewed
      const now = new Date().toISOString();
      console.log("review update:", { sectionId: activeSectionData.id, is_reviewed: true, reviewed_at: now });
      patchSection(activeSectionData.id, { is_reviewed: true, reviewed_at: now });
      setSections((prev) =>
        prev.map((s) =>
          s.id === activeSectionData.id ? { ...s, is_reviewed: true, reviewed_at: now } : s
        )
      );
    } catch (err) {
      console.error("AI review failed:", err);
      setReviewState("not_started");
    } finally {
      setReviewing(false);
    }
  }

  // Check if review is complete after suggestion actions
  useEffect(() => {
    if (reviewState === "loaded" && totalSuggestions > 0 && pendingCount === 0) {
      setReviewState("complete");
    }
  }, [reviewState, totalSuggestions, pendingCount]);

  // Finalize — smart confirmation
  function handleFinalizeClick() {
    if (!activeSectionData) return;
    console.log("finalize button click:", activeSectionData.id);

    // Case C: review complete or no pending suggestions
    if (
      (reviewState === "complete") ||
      (reviewState === "loaded" && pendingCount === 0)
    ) {
      console.log("modal case selected: C (immediate finalize)");
      doFinalize();
      return;
    }

    // Case A: no review run
    if (reviewState === "not_started") {
      console.log("modal case selected: A (no review)");
      setFinalizeModal("no_review");
      return;
    }

    // Case B: review loaded but pending suggestions remain
    if (reviewState === "loaded" && pendingCount > 0) {
      console.log("modal case selected: B (pending suggestions)");
      setFinalizeModal("pending_suggestions");
      return;
    }

    // Fallback: finalize
    doFinalize();
  }

  function doFinalize() {
    if (!activeSectionData) return;
    const now = new Date().toISOString();
    console.log("finalize confirmed:", activeSectionData.id);

    const updates: Record<string, unknown> = {
      is_finalized: true,
      finalized_at: now,
      is_reviewed: true,
    };
    if (!activeSectionData.reviewed_at) {
      updates.reviewed_at = now;
    }

    patchSection(activeSectionData.id, updates);
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSectionData.id
          ? {
              ...s,
              is_finalized: true,
              finalized_at: now,
              is_reviewed: true,
              reviewed_at: s.reviewed_at ?? now,
            }
          : s
      )
    );
    setFinalizeModal(null);
  }

  // Accept suggestion
  function handleAccept(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion || !activeSectionId) return;

    const textToApply = suggestion.editedText ?? suggestion.suggested_text;
    const newStatus = suggestion.editedText ? "edited" : "accepted";
    console.log("accepted edit action:", {
      original: suggestion.original_text,
      replacement: textToApply,
      status: newStatus,
    });

    // Capture current content before replacing so we can undo
    const currentContent = sections.find((s) => s.id === activeSectionId)?.content ?? "";

    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== activeSectionId) return s;
        const newContent = s.content.replace(suggestion.original_text, textToApply);
        patchSection(s.id, { content: newContent });
        return { ...s, content: newContent };
      })
    );

    setSuggestions((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, status: newStatus as SuggestionState["status"], previousContent: currentContent } : s
      )
    );
    setEditingIndex(null);
  }

  // Undo accepted/edited suggestion
  function handleUndo(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion || !activeSectionId || !suggestion.previousContent) return;

    console.log("undo action:", { index, original: suggestion.original_text });

    // Restore the section content to what it was before accept
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== activeSectionId) return s;
        patchSection(s.id, { content: suggestion.previousContent! });
        return { ...s, content: suggestion.previousContent! };
      })
    );

    setSuggestions((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, status: "pending", previousContent: null } : s
      )
    );
  }

  function handleSkip(index: number) {
    console.log("skip action:", suggestions[index]?.original_text);
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status: "skipped" } : s))
    );
    setEditingIndex(null);
  }

  function handleStartEdit(index: number) {
    console.log("edited suggestion action - start:", suggestions[index]?.suggested_text);
    setSuggestions((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, editedText: s.editedText ?? s.suggested_text } : s
      )
    );
    setEditingIndex(index);
  }

  function handleEditChange(index: number, value: string) {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, editedText: value } : s))
    );
  }

  if (loading) {
    return (
      <div className="px-8 py-10">
        <p className="text-[13px] text-[var(--text-muted)]">Loading version...</p>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="px-8 py-10">
        <p className="text-[13px] text-[var(--text-muted)]">Version not found.</p>
        <Link
          href={backRoute}
          className="mt-2 inline-block text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]"
        >
          Back to project
        </Link>
      </div>
    );
  }

  const progressPercent = totalSections > 0 ? (finalizedCount / totalSections) * 100 : 0;

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-default)]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between px-8 py-3">
          <div className="flex items-center gap-4">
            <Link
              href={backRoute}
              className="rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)]"
            >
              &larr; Back
            </Link>
            <h1 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Version {version.version_number} &mdash; Final Edit
            </h1>
            <span className="text-xs text-[var(--text-muted)]">
              {new Date(version.created_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-[var(--text-muted)]">
              {finalizedCount} of {totalSections} finalized &bull; {reviewedCount} of {totalSections} reviewed
            </p>
            {finalizedCount === totalSections && totalSections > 0 && (
              <button
                onClick={() => router.push(`/projects/${projectId}/export/book?version=${versionId}`)}
                title="Preview / Export"
                className="text-white text-xs font-semibold transition-colors"
                style={{ height: 30, padding: "0 12px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                  Preview / Export
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-[rgba(255,255,255,0.04)]">
          <div
            className="h-full bg-green-500/60 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — section nav */}
        <aside className="shrink-0 border-r border-[var(--border-default)] overflow-y-auto" style={{ width: 280, background: "var(--surface-1)" }}>
          <nav className="flex flex-col gap-0.5 text-[13px] px-4 pt-5 pb-4">
            <div className="px-2 pb-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Sections</span>
            </div>

            {(() => {
              // Group sections: standalone (prologue/epilogue) and chapter groups
              const standalone = sections.filter((s) => s.section_type !== "chapter");
              const chapterSections = sections.filter((s) => s.section_type === "chapter");
              const chapterGroups: { chapterName: string; sections: Section[] }[] = [];
              for (const s of chapterSections) {
                const dashIdx = s.section_title.indexOf(" \u2014 ");
                const chapterName = dashIdx >= 0 ? s.section_title.slice(0, dashIdx) : s.section_title;
                const existing = chapterGroups.find((g) => g.chapterName === chapterName);
                if (existing) existing.sections.push(s);
                else chapterGroups.push({ chapterName, sections: [s] });
              }

              const statusDot = (s: Section) => (
                <span
                  className={`shrink-0 text-[10px] ${s.is_finalized ? "text-green-400" : s.is_reviewed ? "text-yellow-400" : "text-red-400/60"}`}
                  title={s.is_finalized ? "Finalized" : s.is_reviewed ? "Reviewed" : "Not reviewed"}
                >&#9679;</span>
              );

              const sectionButton = (s: Section, label: string) => (
                <button
                  key={s.id}
                  onClick={() => goToSection(s.id)}
                  className={[
                    "w-full rounded px-2 py-1.5 text-left text-[14px] transition-colors flex items-center gap-2",
                    activeSectionId === s.id
                      ? "bg-[var(--overlay-active)] text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                  ].join(" ")}
                >
                  {statusDot(s)}
                  <span className="truncate">{label}</span>
                </button>
              );

              return (
                <>
                  {/* Prologue */}
                  {standalone.filter((s) => s.section_type === "prologue").map((s) => sectionButton(s, "Prologue"))}

                  {/* Chapter groups */}
                  {chapterGroups.map((group) => {
                    const isExpanded = expandedChapters[group.chapterName] ?? true;
                    const isChildActive = group.sections.some((s) => s.id === activeSectionId);
                    return (
                      <div key={group.chapterName}>
                        <div className="flex items-center">
                          <button
                            onClick={() => setExpandedChapters((prev) => ({ ...prev, [group.chapterName]: !prev[group.chapterName] }))}
                            className="shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
                            style={{ width: 16, height: 16 }}
                          >
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}><polyline points="3,1 7,5 3,9" /></svg>
                          </button>
                          <button
                            onClick={() => setExpandedChapters((prev) => ({ ...prev, [group.chapterName]: !prev[group.chapterName] }))}
                            className={`flex-1 rounded px-1 py-1.5 text-left text-[14px] font-medium min-w-0 transition-colors ${isChildActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {group.chapterName}
                          </button>
                          <span className="shrink-0 text-[11px] mr-1" style={{ color: "var(--text-faint)" }}>({group.sections.length})</span>
                        </div>
                        {isExpanded && (
                          <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                            {group.sections.map((s) => {
                              const dashIdx = s.section_title.indexOf(" \u2014 ");
                              const sectionLabel = dashIdx >= 0 ? s.section_title.slice(dashIdx + 3) : s.section_title;
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => goToSection(s.id)}
                                  className={[
                                    "w-full rounded px-2 py-1 text-left text-[13px] transition-colors flex items-center gap-2 min-w-0",
                                    activeSectionId === s.id
                                      ? "bg-[var(--overlay-active)] text-[var(--text-primary)]"
                                      : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]",
                                  ].join(" ")}
                                >
                                  {statusDot(s)}
                                  <span className="truncate">{sectionLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Epilogue */}
                  {standalone.filter((s) => s.section_type === "epilogue").map((s) => sectionButton(s, "Epilogue"))}
                </>
              );
            })()}
          </nav>
        </aside>

        {/* Center: editable content */}
        <div className="w-1/2 min-w-0 overflow-y-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {activeSectionData ? (
            <div className="px-6 py-8">
              {/* Section header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                    {activeSectionData.section_title}
                  </h2>
                  {activeSectionData.is_finalized && (
                    <span className="rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                      Finalized
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-faint)]">
                    Section {activeIndex + 1} of {totalSections}
                  </span>
                  {!activeSectionData.is_finalized && activeSectionData.section_type !== "info" && (
                    <button
                      onClick={handleReviewSection}
                      disabled={reviewing}
                      className="rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)] disabled:opacity-40"
                    >
                      {reviewing ? "Reviewing..." : "Review Section"}
                    </button>
                  )}
                  {!activeSectionData.is_finalized && (
                    <button
                      onClick={handleFinalizeClick}
                      className="rounded-lg bg-green-600/20 px-3 py-1.5 text-xs text-green-400 transition-colors hover:bg-green-600/30"
                    >
                      Finalize Section
                    </button>
                  )}
                </div>
              </div>

              {/* AI review status */}
              <p className="text-xs text-[var(--text-faint)] mb-4">{aiStatusLabel}</p>

              {/* Content editor */}
              {activeSectionData.section_type === "info" ? (
                <pre className="whitespace-pre-wrap text-[13px] text-[var(--text-tertiary)] leading-7 bg-[rgba(255,255,255,0.03)] rounded-lg p-4">
                  {(() => {
                    try {
                      const info = JSON.parse(activeSectionData.content);
                      return Object.entries(info)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n");
                    } catch {
                      return activeSectionData.content;
                    }
                  })()}
                </pre>
              ) : (
                <div className="min-h-[55vh]">
                  <RichTextEditor
                    content={activeSectionData.content}
                    onChange={(html) => handleSectionContentChange(activeSectionData.id, html)}
                    placeholder="Section content..."
                    label={activeSectionData.section_title}
                  />
                </div>
              )}

              {/* Prev / Next navigation */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={goPrev}
                  disabled={activeIndex <= 0}
                  className="rounded-lg bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &larr; Previous Section
                </button>
                <button
                  onClick={goNext}
                  disabled={activeIndex >= sections.length - 1}
                  className="rounded-lg bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next Section &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-8">
              <p className="text-[13px] text-[var(--text-faint)]">Select a section to edit.</p>
            </div>
          )}
        </div>

        {/* Right: AI proofing panel */}
        <aside className="w-1/2 shrink-0 border-l border-[var(--border-default)] flex flex-col overflow-hidden" style={{ background: "var(--surface-1)" }}>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {reviewing ? (
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--text-secondary)] mb-1">AI Final Proofing</h3>
                {activeSectionData && (
                  <p className="text-xs text-[var(--text-muted)] mb-3">{activeSectionData.section_title}</p>
                )}
                <p className="text-xs text-[var(--text-muted)]">Analyzing section...</p>
              </div>
            ) : suggestions.length === 0 ? (
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--text-secondary)] mb-1">AI Final Proofing</h3>
                {activeSectionData && (
                  <p className="text-xs text-[var(--text-muted)] mb-3">{activeSectionData.section_title}</p>
                )}
                <p className="text-xs text-[var(--text-faint)]">
                  {activeSectionData?.is_finalized
                    ? "This section is finalized."
                    : reviewState === "complete"
                    ? "No issues found. This section is ready to finalize."
                    : "Use the \"Review Section\" button to get AI suggestions."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-[13px] font-semibold text-[var(--text-secondary)] mb-1">AI Final Proofing</h3>
                {activeSectionData && (
                  <p className="text-xs text-[var(--text-muted)]">{activeSectionData.section_title}</p>
                )}
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  {handledCount} of {totalSuggestions} handled &bull; {pendingCount} remaining
                </p>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className={[
                      "rounded-[10px] border p-3 text-xs",
                      s.status === "accepted" || s.status === "edited"
                        ? "border-green-500/20 bg-green-500/5 opacity-60"
                        : s.status === "skipped"
                        ? "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] opacity-40"
                        : "border-[var(--border-hover)] bg-[rgba(255,255,255,0.03)]",
                    ].join(" ")}
                  >
                    <div className="mb-2">
                      <p className="text-[var(--text-faint)] mb-1">Original:</p>
                      <p className="text-[var(--text-tertiary)] line-through">{s.original_text}</p>
                    </div>
                    <div className="mb-2">
                      <p className="text-[var(--text-faint)] mb-1">Suggested:</p>
                      {editingIndex === i ? (
                        <textarea
                          value={s.editedText ?? s.suggested_text}
                          onChange={(e) => handleEditChange(i, e.target.value)}
                          className="w-full rounded border border-[var(--border-default)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none resize-none"
                          rows={3}
                        />
                      ) : (
                        <p className="text-green-400/80">
                          {s.editedText ?? s.suggested_text}
                        </p>
                      )}
                    </div>
                    <p className="text-[var(--text-faint)] italic mb-2">{s.reason}</p>
                    {s.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(i)}
                          className="rounded bg-green-600/20 px-2 py-1 text-green-400 transition-colors hover:bg-green-600/30"
                        >
                          {editingIndex === i ? "Apply" : "Accept"}
                        </button>
                        {editingIndex !== i && (
                          <button
                            onClick={() => handleStartEdit(i)}
                            className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-1 text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-secondary)]"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleSkip(i)}
                          className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-1 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-tertiary)]"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                    {s.status === "accepted" && (
                      <div className="flex items-center gap-2">
                        <p className="text-green-400/60">Accepted</p>
                        {s.previousContent && (
                          <button onClick={() => handleUndo(i)} className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-tertiary)]">Undo</button>
                        )}
                      </div>
                    )}
                    {s.status === "edited" && (
                      <div className="flex items-center gap-2">
                        <p className="text-green-400/60">Edited &amp; Applied</p>
                        {s.previousContent && (
                          <button onClick={() => handleUndo(i)} className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-tertiary)]">Undo</button>
                        )}
                      </div>
                    )}
                    {s.status === "skipped" && <p className="text-[var(--text-faint)]">Skipped</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Finalize confirmation modal */}
      {finalizeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setFinalizeModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-2)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {finalizeModal === "no_review" ? (
              <>
                <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">
                  Finalize without AI review?
                </h2>
                <p className="text-[13px] text-[var(--text-tertiary)] mb-5">
                  You have not reviewed this section with AI. Are you sure you want to finalize it?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      console.log("cancel chosen");
                      setFinalizeModal(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      console.log("review-first chosen");
                      setFinalizeModal(null);
                      handleReviewSection();
                    }}
                    className="rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)]"
                  >
                    Review First
                  </button>
                  <button
                    onClick={() => {
                      console.log("finalize anyway chosen (case A)");
                      doFinalize();
                    }}
                    className="rounded-lg bg-green-600/20 px-3 py-1.5 text-[13px] text-green-400 transition-colors hover:bg-green-600/30"
                  >
                    Finalize Anyway
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">
                  Pending AI suggestions
                </h2>
                <p className="text-[13px] text-[var(--text-tertiary)] mb-5">
                  You still have {pendingCount} unresolved suggestion{pendingCount !== 1 ? "s" : ""} for this section. What would you like to do?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      console.log("cancel chosen");
                      setFinalizeModal(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      console.log("go-back-to-review chosen");
                      setFinalizeModal(null);
                    }}
                    className="rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)]"
                  >
                    Go Back to Review
                  </button>
                  <button
                    onClick={() => {
                      console.log("finalize anyway chosen (case B)");
                      doFinalize();
                    }}
                    className="rounded-lg bg-green-600/20 px-3 py-1.5 text-[13px] text-green-400 transition-colors hover:bg-green-600/30"
                  >
                    Finalize Anyway
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
