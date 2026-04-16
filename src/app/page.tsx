"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useModes, type ModeKey } from "@/components/layout/modes-context";

const TYPE_OPTIONS = ["Book", "App", "Business", "Music"] as const;

const FILTER_MAP: Record<string, string> = {
  Books: "Book",
  Apps: "App",
  Businesses: "Business",
  Music: "Music",
};

const TYPE_COLORS: Record<string, string> = {
  App: "#8b7cf5",
  Book: "#4ade80",
  Business: "#fbbf24",
  Music: "#5a9af5",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  App: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="4" height="4" rx="1" />
      <rect x="8" y="2" width="4" height="4" rx="1" />
      <rect x="2" y="8" width="4" height="4" rx="1" />
      <rect x="8" y="8" width="4" height="4" rx="1" />
    </svg>
  ),
  Book: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2.5A1.5 1.5 0 013.5 1H5a1 1 0 011 1v10a1 1 0 01-1 1H3.5A1.5 1.5 0 012 11.5V2.5z" />
      <path d="M6 2h4.5A1.5 1.5 0 0112 3.5v8a1.5 1.5 0 01-1.5 1.5H6V2z" />
    </svg>
  ),
  Business: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7,1.5 8.5,5 12.5,5.3 9.5,7.8 10.4,11.8 7,9.6 3.6,11.8 4.5,7.8 1.5,5.3 5.5,5" />
    </svg>
  ),
  Music: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="10.5" r="2" />
      <path d="M6.5 10.5V3l5-1.5v8" />
      <circle cx="9.5" cy="9.5" r="2" />
    </svg>
  ),
};

type Project = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  updated_at: string | null;
  archived: boolean | null;
};

export default function HomePage() {
  return (
    <Suspense>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enabledModes } = useModes();
  const activeFilter = searchParams.get("filter") ?? "All";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("Book");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects?archived=${showArchived}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data);
        } else if (data.error) {
          setLoadError(data.error);
        }
      })
      .catch(() => setLoadError("Failed to load projects."))
      .finally(() => setLoading(false));
  }, [showArchived]);

  const filtered =
    activeFilter === "All"
      ? projects
      : projects.filter((p) => {
          const matchType = FILTER_MAP[activeFilter];
          return matchType ? p.type === matchType : p.type === activeFilter;
        });

  const [error, setError] = useState<string | null>(null);

  async function loadProjects() {
    const res = await fetch(`/api/projects?archived=${showArchived}`);
    const data = await res.json();
    if (Array.isArray(data)) setProjects(data);
  }

  async function handleArchive(projectId: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, archived: !showArchived }),
    });
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create project.");
        return;
      }
      if (data.id) {
        setShowModal(false);
        setNewName("");
        setNewType("Book");
        await loadProjects();
        router.push(`/projects/${data.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const heading =
    showArchived
      ? "Archived Projects"
      : activeFilter === "All"
      ? "Projects"
      : activeFilter;

  return (
    <div className="mobile-px-4" style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            {heading}
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Manage your builds</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            title="Help"
          >
            ?
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs font-semibold text-white whitespace-nowrap"
            style={{
              height: 30,
              padding: "0 12px",
              background: "linear-gradient(180deg, #5a9af5, #4a88e0)",
              border: "none",
              borderRadius: 6,
            }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Projects card */}
      {loadError && (
        <p className="mb-4 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", padding: "7px 10px", borderRadius: 6 }}>{loadError}</p>
      )}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "10px 14px 8px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
            }}
          >
            {showArchived ? "Archived Projects" : "All Projects"}
          </span>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-[10px] font-medium"
            style={{ color: "var(--text-muted)", transition: "color 0.12s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            {showArchived ? "\u2190 Active" : `Archived (${projects.filter((p) => !filtered.includes(p) || true).length > 0 ? "" : "0"})`}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: "32px 14px" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading projects...</p>
          </div>
        ) : filtered.length === 0 && !loadError ? (
          <div className="py-16 text-center">
            <p style={{ color: "var(--text-muted)" }}>No projects yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-xs underline"
              style={{ color: "var(--text-tertiary)" }}
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="mobile-overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th
                  className="pb-2 pl-3.5 pr-6 pt-2.5 text-left font-medium"
                  style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
                >
                  Name
                </th>
                <th
                  className="pb-2 pr-6 pt-2.5 text-left font-medium"
                  style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
                >
                  Type
                </th>
                <th
                  className="pb-2 pr-6 pt-2.5 text-left font-medium"
                  style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
                >
                  Updated
                </th>
                <th className="pb-2 pt-2.5 text-left font-medium" style={{ fontSize: 11 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const color = TYPE_COLORS[project.type] ?? "#5a9af5";
                const icon = TYPE_ICONS[project.type];
                return (
                  <tr
                    key={project.id}
                    className="group cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="py-2.5 pl-3.5 pr-6">
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex items-center gap-3"
                        style={{ color: "inherit", transition: "color 0.12s" }}
                      >
                        {/* Type icon badge */}
                        <span
                          className="flex shrink-0 items-center justify-center"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: color,
                            color: "#fff",
                          }}
                        >
                          {icon ?? (
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="7" cy="7" r="5.5" />
                            </svg>
                          )}
                        </span>
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                          {project.name}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 pr-6">
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: `${color}18`,
                          color: color,
                        }}
                      >
                        {project.type}
                      </span>
                    </td>
                    <td className="py-2.5 pr-6" style={{ color: "var(--text-muted)" }}>
                      {formatDate(project.updated_at ?? project.created_at)}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <button
                        onClick={(e) => { e.preventDefault(); handleArchive(project.id); }}
                        className="text-[11px] font-medium"
                        style={{
                          padding: "0 6px",
                          height: 24,
                          borderRadius: 4,
                          color: "var(--text-muted)",
                          background: "transparent",
                          border: "none",
                          transition: "all 0.12s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--overlay-active)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                      >
                        {showArchived ? "Unarchive" : "Archive"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full"
            style={{
              maxWidth: 420,
              margin: "0 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "20px 24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>New Project</h2>

            <label className="mb-1.5 block text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              Project Name
            </label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. My Next Book"
              className="mb-4 w-full text-[13px]"
              style={{
                padding: "7px 10px",
                background: "var(--overlay-card)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                color: "var(--text-primary)",
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(90,154,245,0.35)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
            />

            <label className="mb-1.5 block text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="mb-6 w-full text-[13px]"
              style={{
                appearance: "none",
                padding: "7px 28px 7px 10px",
                background: "var(--overlay-card)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                color: "var(--text-primary)",
                outline: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.3)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
              }}
            >
              {enabledModes.map((t) => (
                <option key={t} value={t} style={{ background: "var(--surface-2)" }}>
                  {t}
                </option>
              ))}
            </select>

            {error && (
              <p className="mb-4 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", padding: "7px 10px", borderRadius: 6 }}>{error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setError(null); }}
                className="text-xs font-medium"
                style={{
                  height: 28,
                  padding: "0 10px",
                  background: "var(--overlay-hover)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  color: "var(--text-secondary)",
                  transition: "all 0.12s",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="text-xs font-semibold text-white whitespace-nowrap"
                style={{
                  height: 30,
                  padding: "0 12px",
                  background: "linear-gradient(180deg, #5a9af5, #4a88e0)",
                  border: "none",
                  borderRadius: 6,
                  opacity: !newName.trim() || creating ? 0.35 : 1,
                  cursor: !newName.trim() || creating ? "not-allowed" : "pointer",
                }}
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full"
            style={{
              maxWidth: 480,
              margin: "0 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "24px 28px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>Welcome to Build Pilot</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="flex items-center justify-center transition-colors"
                style={{ width: 24, height: 24, borderRadius: 6, background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
              This is your <strong style={{ color: "var(--text-primary)" }}>Projects</strong> dashboard. Here you can create, manage, and organize all your builds in one place.
            </p>

            <div className="flex flex-col gap-3 mb-5">
              <div className="flex items-start gap-3">
                <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "rgba(90,154,245,0.15)", color: "#5a9af5", fontSize: 11, fontWeight: 700 }}>1</span>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  Click <strong style={{ color: "var(--text-secondary)" }}>+ New Project</strong> to create a book, app, or other project type.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "rgba(90,154,245,0.15)", color: "#5a9af5", fontSize: 11, fontWeight: 700 }}>2</span>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  Click on any project to open it. For books, you'll start by filling in <strong style={{ color: "var(--text-secondary)" }}>Book Info</strong>, then build your <strong style={{ color: "var(--text-secondary)" }}>Storyline</strong> and <strong style={{ color: "var(--text-secondary)" }}>Synopsis</strong>.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "rgba(90,154,245,0.15)", color: "#5a9af5", fontSize: 11, fontWeight: 700 }}>3</span>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  Use the <strong style={{ color: "var(--text-secondary)" }}>AI Assistant</strong> on every page to brainstorm, get feedback, and refine your work.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "rgba(90,154,245,0.15)", color: "#5a9af5", fontSize: 11, fontWeight: 700 }}>4</span>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  When your chapters are written, go to <strong style={{ color: "var(--text-secondary)" }}>Manuscript</strong> to preview, then <strong style={{ color: "var(--text-secondary)" }}>Publish</strong> to finalize and export.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="text-[13px] font-medium text-white"
                style={{
                  height: 32,
                  padding: "0 16px",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
