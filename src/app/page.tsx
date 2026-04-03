"use client";

import { useState } from "react";
import Link from "next/link";

const TABS = ["All", "Books", "Apps", "Businesses", "Songs"] as const;
type Tab = (typeof TABS)[number];

const PROJECTS = [
  { id: "1", name: "My First Book", type: "Book", updated: "Apr 28, 2024" },
  { id: null, name: "Loan App", type: "App", updated: "Mar 29, 2024" },
  { id: null, name: "Restaurant Plan", type: "Business", updated: "Feb 7, 2024" },
  { id: null, name: "Creative Flow Songs", type: "Songs", updated: "Feb 5, 2024" },
  { id: null, name: "MindShift 2.0", type: "App", updated: "Jan 10, 2024" },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("All");

  const filtered =
    activeTab === "All"
      ? PROJECTS
      : PROJECTS.filter((p) => p.type === activeTab.slice(0, -1) || p.type === activeTab);

  return (
    <div className="px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-white/40">Manage your builds</p>
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
              key={project.name}
              className="group cursor-pointer transition-colors hover:bg-white/[0.03]"
            >
              <td className="py-3.5 pr-6 font-medium text-white/90">
                {project.id ? (
                  <Link href={`/projects/${project.id}`} className="hover:text-white transition-colors">
                    {project.name}
                  </Link>
                ) : (
                  project.name
                )}
              </td>
              <td className="py-3.5 pr-6 text-white/50">{project.type}</td>
              <td className="py-3.5 text-white/40">{project.updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
