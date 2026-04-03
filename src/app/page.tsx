"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TABS = ["All", "Books", "Apps", "Businesses", "Songs"] as const;
type Tab = (typeof TABS)[number];

const TYPE_OPTIONS = ["Book", "App", "Business", "Songs"] as const;

type Project = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  updated_at: string | null;
  archived: boolean | null;
};

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
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
    activeTab === "All"
      ? projects
      : projects.filter(
          (p) => p.type === activeTab.slice(0, -1) || p.type === activeTab
        );

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

  return (
    <div className="px-8 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {showArchived ? "Archived Projects" : "Projects"}
          </h1>
          <p className="mt-1 text-sm text-white/40">Manage your builds</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
        >
          + New Project
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-1 border-b border-white/[0.07] pb-3">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              "rounded-t px-3 pb-3 pt-2 text-sm transition-colors",
              activeTab === tab
                ? "border-b-2 border-white font-medium text-white"
                : "text-white/35 hover:bg-white/[0.04] hover:text-white/65",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      {loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{loadError}</p>
      )}
      {loading ? (
        <p className="text-sm text-white/40">Loading projects…</p>
      ) : projects.length === 0 && !loadError ? (
        <div className="py-16 text-center">
          <p className="text-white/40">No projects yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 text-sm text-white/60 underline hover:text-white/80"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-widest text-white/30">
              <th className="pb-3 pr-6 font-medium">Name</th>
              <th className="pb-3 pr-6 font-medium">Type</th>
              <th className="pb-3 pr-6 font-medium">Updated</th>
              <th className="pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filtered.map((project) => (
              <tr
                key={project.id}
                className="group cursor-pointer transition-colors hover:bg-white/[0.03]"
              >
                <td className="py-3.5 pr-6 font-medium text-white/90">
                  <Link
                    href={`/projects/${project.id}`}
                    className="transition-colors hover:text-white"
                  >
                    {project.name}
                  </Link>
                </td>
                <td className="py-3.5 pr-6 text-white/50">{project.type}</td>
                <td className="py-3.5 pr-6 text-white/40">
                  {formatDate(project.updated_at ?? project.created_at)}
                </td>
                <td className="py-3.5 text-right">
                  <button
                    onClick={() => handleArchive(project.id)}
                    className="rounded px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                  >
                    {showArchived ? "Unarchive" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Archived toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-white/30 transition-colors hover:text-white/60"
        >
          {showArchived ? "← Back to active projects" : "View archived projects"}
        </button>
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-lg font-semibold">New Project</h2>

            <label className="mb-1 block text-sm text-white/50">
              Project Name
            </label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. My Next Book"
              className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
            />

            <label className="mb-1 block text-sm text-white/50">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="mb-6 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t} className="bg-[#1a1a1a] text-white">
                  {t}
                </option>
              ))}
            </select>

            {error && (
              <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setError(null); }}
                className="rounded-lg px-4 py-2 text-sm text-white/50 transition-colors hover:text-white/80"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-40"
              >
                {creating ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
