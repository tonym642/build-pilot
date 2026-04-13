"use client";

import { useState, useEffect, useRef } from "react";

type TodoItem = {
  id: string;
  text: string;
  notes: string;
  is_complete: boolean;
  created_at: string;
};

type Filter = "all" | "pending" | "completed";

export default function ChecklistPage() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectForDelete, setSelectForDelete] = useState<Set<string>>(new Set());

  // New item modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Detail save timer
  const detailSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load
  useEffect(() => {
    fetch("/api/todos")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setTodos(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Focus title input when modal opens
  useEffect(() => {
    if (showModal) setTimeout(() => titleInputRef.current?.focus(), 50);
  }, [showModal]);

  // Create
  async function createItem() {
    if (!newTitle.trim()) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newTitle.trim(), notes: newNotes.trim() }),
    });
    if (res.ok) {
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
      setSelectedId(todo.id);
      setShowModal(false);
      setNewTitle("");
      setNewNotes("");
    }
  }

  // Toggle complete
  function toggleComplete(id: string) {
    setTodos((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const updated = { ...t, is_complete: !t.is_complete };
      fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_complete: updated.is_complete }),
      });
      return updated;
    }));
  }

  // Update detail field (debounced)
  function updateField(id: string, field: "text" | "notes", value: string) {
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t));
    if (detailSaveRef.current) clearTimeout(detailSaveRef.current);
    detailSaveRef.current = setTimeout(() => {
      fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
    }, 800);
  }

  // Toggle select for delete
  function toggleSelectDelete(id: string) {
    setSelectForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Delete selected
  async function deleteSelected() {
    const ids = Array.from(selectForDelete);
    if (ids.length === 0) return;
    if (selectedId && selectForDelete.has(selectedId)) setSelectedId(null);
    setTodos((prev) => prev.filter((t) => !selectForDelete.has(t.id)));
    setSelectForDelete(new Set());
    await fetch("/api/todos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  const pending = todos.filter((t) => !t.is_complete);
  const completed = todos.filter((t) => t.is_complete);
  const showPending = filter === "all" || filter === "pending";
  const showCompleted = filter === "all" || filter === "completed";
  const selected = selectedId ? todos.find((t) => t.id === selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100vh - 48px)", background: "var(--surface-1)" }}>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading checklist...</p>
      </div>
    );
  }

  return (
    <div
      className="mobile-px-4 flex flex-col"
      style={{
        position: "relative",
        zIndex: 1,
        padding: "24px 32px",
        height: "calc(100vh - 48px)",
        background: "var(--surface-1)",
        isolation: "isolate",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            Checklist
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Track features, bugs, and ideas for the app
          </p>
        </div>
        <span className="text-[10px] font-medium uppercase" style={{ letterSpacing: "0.08em", color: "var(--text-muted)", opacity: 0.5 }}>
          {pending.length} pending, {completed.length} done
        </span>
      </div>

      {/* Two-panel layout */}
      <div className="flex" style={{ marginTop: 20, gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Left panel: item list ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Controls */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => setShowModal(true)}
              className="text-[11px] font-medium transition-colors shrink-0"
              style={{
                height: 26,
                padding: "0 10px",
                background: "var(--overlay-hover)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--overlay-active)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--overlay-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              + New Item
            </button>
            <div style={{ flex: 1 }} />
            {(["all", "pending", "completed"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors capitalize ${filter === f ? "bg-[var(--overlay-active)] text-[var(--text-primary)]" : "text-[var(--text-faint)] hover:text-[var(--text-tertiary)]"}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Item list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Pending */}
            {showPending && pending.length > 0 && (
              <div>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Pending ({pending.length})</span>
                </div>
                {pending.map((todo) => (
                  <button
                    key={todo.id}
                    onClick={() => setSelectedId(todo.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{
                      background: selectedId === todo.id ? "var(--overlay-active)" : "transparent",
                      borderLeft: selectedId === todo.id ? "2px solid var(--accent-blue)" : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (selectedId !== todo.id) e.currentTarget.style.background = "var(--overlay-hover)"; }}
                    onMouseLeave={(e) => { if (selectedId !== todo.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Checkbox */}
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleComplete(todo.id); }}
                      className="shrink-0 flex items-center justify-center cursor-pointer"
                      style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--border-hover)", background: "transparent" }}
                    />
                    <span className="flex-1 text-[13px] truncate" style={{ color: selectedId === todo.id ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {todo.text}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Completed */}
            {showCompleted && completed.length > 0 && (
              <div>
                <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Completed ({completed.length})</span>
                  {selectForDelete.size > 0 && (
                    <button
                      onClick={deleteSelected}
                      className="text-[10px] font-medium transition-colors"
                      style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Delete ({selectForDelete.size})
                    </button>
                  )}
                </div>
                {completed.map((todo) => (
                  <button
                    key={todo.id}
                    onClick={() => setSelectedId(todo.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{
                      background: selectedId === todo.id ? "var(--overlay-active)" : "transparent",
                      borderLeft: selectedId === todo.id ? "2px solid var(--accent-green)" : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (selectedId !== todo.id) e.currentTarget.style.background = "var(--overlay-hover)"; }}
                    onMouseLeave={(e) => { if (selectedId !== todo.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Select for delete */}
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleSelectDelete(todo.id); }}
                      className="shrink-0 flex items-center justify-center cursor-pointer"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: selectForDelete.has(todo.id) ? "1.5px solid #ef4444" : "1.5px solid transparent",
                        background: selectForDelete.has(todo.id) ? "rgba(239,68,68,0.15)" : "transparent",
                      }}
                    >
                      {selectForDelete.has(todo.id) && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2.5" /></svg>
                      )}
                    </span>
                    {/* Completed checkbox */}
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleComplete(todo.id); }}
                      className="shrink-0 flex items-center justify-center cursor-pointer"
                      style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--accent-green)", background: "rgba(74,222,128,0.12)" }}
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2.5" /></svg>
                    </span>
                    <span className="flex-1 text-[13px] truncate line-through" style={{ color: "var(--text-faint)" }}>
                      {todo.text}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Empty states */}
            {todos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
                <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No items yet.</p>
                <button onClick={() => setShowModal(true)} className="text-[12px] font-medium transition-colors" style={{ color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
                  Create your first item
                </button>
              </div>
            )}
            {filter === "pending" && pending.length === 0 && todos.length > 0 && (
              <p className="text-center py-12 text-[12px]" style={{ color: "var(--text-faint)" }}>No pending items.</p>
            )}
            {filter === "completed" && completed.length === 0 && todos.length > 0 && (
              <p className="text-center py-12 text-[12px]" style={{ color: "var(--text-faint)" }}>No completed items yet.</p>
            )}
          </div>
        </div>

        {/* ── Right panel: detail ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {selected ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Detail header */}
              <div className="shrink-0 flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {/* Status indicator */}
                <span
                  className="shrink-0"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: selected.is_complete ? "var(--accent-green)" : "var(--accent-blue)",
                    boxShadow: selected.is_complete ? "0 0 8px rgba(74,222,128,0.3)" : "0 0 8px rgba(90,154,245,0.3)",
                  }}
                />
                <span className="text-[10px] font-medium uppercase" style={{ letterSpacing: "0.06em", color: selected.is_complete ? "var(--accent-green)" : "var(--text-muted)" }}>
                  {selected.is_complete ? "Completed" : "Pending"}
                </span>
                <div style={{ flex: 1 }} />
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  Created {new Date(selected.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>

              {/* Title */}
              <div className="mt-5">
                <label className="text-[10px] font-semibold uppercase block mb-2" style={{ letterSpacing: "0.06em", color: "var(--text-faint)" }}>Title</label>
                <input
                  type="text"
                  value={selected.text}
                  onChange={(e) => updateField(selected.id, "text", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                />
              </div>

              {/* Notes */}
              <div className="mt-5 flex-1 flex flex-col min-h-0">
                <label className="text-[10px] font-semibold uppercase block mb-2" style={{ letterSpacing: "0.06em", color: "var(--text-faint)" }}>Notes</label>
                <textarea
                  value={selected.notes}
                  onChange={(e) => updateField(selected.id, "notes", e.target.value)}
                  placeholder="Add details, context, or requirements..."
                  className="flex-1 w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                  style={{ fontFamily: "inherit", lineHeight: 1.6 }}
                />
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <button
                  onClick={() => toggleComplete(selected.id)}
                  className="text-[11px] font-medium transition-colors"
                  style={{
                    height: 28,
                    padding: "0 12px",
                    background: selected.is_complete ? "var(--overlay-hover)" : "rgba(74,222,128,0.1)",
                    border: selected.is_complete ? "1px solid var(--border-default)" : "1px solid rgba(74,222,128,0.25)",
                    borderRadius: 6,
                    color: selected.is_complete ? "var(--text-secondary)" : "var(--accent-green)",
                    cursor: "pointer",
                  }}
                >
                  {selected.is_complete ? "Mark as Pending" : "Mark as Complete"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Select an item to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* ── New Item Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full"
            style={{ maxWidth: 460, margin: "0 16px", background: "var(--surface-2)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "20px 24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold mb-5" style={{ color: "var(--text-primary)" }}>New Checklist Item</h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase block mb-1.5" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>Title</label>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) createItem(); }}
                  placeholder="e.g. Add dark mode toggle"
                  className="w-full rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase block mb-1.5" style={{ letterSpacing: "0.06em", color: "var(--text-muted)" }}>Notes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Add details, context, or requirements..."
                  className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors"
                  style={{ fontFamily: "inherit", lineHeight: 1.6 }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => { setShowModal(false); setNewTitle(""); setNewNotes(""); }}
                className="text-xs font-medium"
                style={{ height: 28, padding: "0 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={createItem}
                disabled={!newTitle.trim()}
                className="text-xs font-semibold text-white"
                style={{
                  height: 30,
                  padding: "0 14px",
                  background: newTitle.trim() ? "linear-gradient(180deg, #5a9af5, #4a88e0)" : "var(--overlay-hover)",
                  border: "none",
                  borderRadius: 6,
                  cursor: newTitle.trim() ? "pointer" : "default",
                  color: newTitle.trim() ? "#fff" : "var(--text-faint)",
                  opacity: newTitle.trim() ? 1 : 0.5,
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
