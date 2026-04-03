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

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeTab === "All"
      ? projects
      : projects.filter(
          (p) => p.type === activeTab.slice(0, -1) || p.type === activeTab
        );

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setShowModal(false);
        setNewName("");
        setNewType("Book");
        router.push(`/projects/${data.id}`);
      }
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
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
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
      {loading ? (
        <p className="text-sm text-white/40">Loading projects…</p>
      ) : projects.length === 0 ? (
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
              <th className="pb-3 font-medium">Updated</th>
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
                <td className="py-3.5 text-white/40">
                  {formatDate(project.updated_at ?? project.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
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
