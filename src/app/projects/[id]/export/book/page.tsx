"use client";

/**
 * Export / Book Preview Page
 *
 * Clean, print-ready view of a finalized book version.
 * No sidebar, no AI panel, no editing controls.
 *
 * URL: /projects/:id/export/book?version={versionId}
 * Source: book_version_sections table (same as Final Edit page)
 */

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Section = {
  id: string;
  section_type: string;
  section_title: string;
  position: number;
  content: string;
  is_finalized: boolean | null;
};

type Version = {
  id: string;
  version_number: number;
  source: string;
  status: string;
  created_at: string;
};

function cleanHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<span\s+style="[^"]*">([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<span\s*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/\s+style="[^"]*"/gi, "")
    .replace(/<p>\s*[-\u2013\u2014]{2,}\s*<\/p>/gi, "")
    .replace(/<p>\s*---\s*<\/p>/gi, "")
    .replace(/<hr\s*\/?>/gi, "");
}

export default function ExportBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const searchParams = useSearchParams();
  const versionId = searchParams.get("version");

  const [version, setVersion] = useState<Version | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const backRoute = `/projects/${projectId}?stage=Publish`;

  useEffect(() => {
    if (!versionId) { setLoading(false); return; }
    fetch(`/api/projects/${projectId}/versions/${versionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.version) setVersion(data.version);
        if (Array.isArray(data.sections)) {
          setSections(
            [...data.sections]
              .filter((s: Section) => s.section_type !== "info")
              .sort((a: Section, b: Section) => a.position - b.position)
          );
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, versionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[13px] text-[var(--text-muted)]">Loading preview...</p>
      </div>
    );
  }

  if (!versionId || !version) {
    return (
      <div className="px-8 py-10">
        <p className="text-[13px] text-[var(--text-muted)]">Version not found.</p>
        <Link href={backRoute} className="mt-2 inline-block text-[13px] text-[var(--text-tertiary)] underline hover:text-[var(--text-secondary)]">
          Back to Publish
        </Link>
      </div>
    );
  }

  // Group sections by chapter for book-like rendering
  const chapterGroups: { chapterName: string | null; sections: Section[] }[] = [];
  for (const s of sections) {
    if (s.section_type === "prologue" || s.section_type === "epilogue") {
      chapterGroups.push({ chapterName: null, sections: [s] });
    } else {
      const dashIdx = s.section_title.indexOf(" \u2014 ");
      const chapterName = dashIdx >= 0 ? s.section_title.slice(0, dashIdx) : null;
      if (chapterName) {
        const existing = chapterGroups.find((g) => g.chapterName === chapterName);
        if (existing) existing.sections.push(s);
        else chapterGroups.push({ chapterName, sections: [s] });
      } else {
        chapterGroups.push({ chapterName: null, sections: [s] });
      }
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      {/* Top bar — hidden when printing */}
      <div className="print-hidden sticky top-0 z-10 border-b border-[var(--border-default)] px-8 py-3 flex items-center justify-between" style={{ background: "var(--surface-1)" }}>
        <div className="flex items-center gap-4">
          <Link
            href={backRoute}
            className="rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)]"
          >
            &larr; Back to Publish
          </Link>
          <h1 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Preview &mdash; Version {version.version_number}
          </h1>
          <span className="text-xs text-[var(--text-muted)]">
            {new Date(version.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
        <button
          onClick={() => window.print()}
          className="text-white text-xs font-semibold transition-colors"
          style={{ height: 30, padding: "0 16px", background: "linear-gradient(180deg, #5a9af5, #4a88e0)", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Book content — print-friendly */}
      <div className="mx-auto px-8 py-12" style={{ maxWidth: 780 }}>
        {chapterGroups.map((group, gi) => (
          <div key={gi} className="mb-12">
            {/* Chapter heading */}
            {group.chapterName && (
              <h2 className="text-[22px] font-bold mb-6 pb-3 border-b" style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}>
                {group.chapterName}
              </h2>
            )}

            {group.sections.map((s, si) => {
              const dashIdx = s.section_title.indexOf(" \u2014 ");
              const displayTitle =
                s.section_type === "prologue" ? "Prologue"
                : s.section_type === "epilogue" ? "Epilogue"
                : dashIdx >= 0 ? s.section_title.slice(dashIdx + 3)
                : s.section_title;

              return (
                <div key={s.id} className={si > 0 ? "mt-8" : ""}>
                  <h3 className="text-[17px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    {displayTitle}
                  </h3>
                  <div
                    className="prose-rendered text-[14px] leading-8"
                    style={{ color: "var(--text-secondary)" }}
                    dangerouslySetInnerHTML={{ __html: cleanHtml(s.content) }}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {sections.length === 0 && (
          <p className="text-[13px] text-[var(--text-faint)]">No sections found for this version.</p>
        )}
      </div>
    </div>
  );
}
