"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
export type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useEffect, useRef } from "react";

/**
 * Strip unwanted inline styles and wrapper spans from HTML.
 * Keeps only clean structural tags: p, strong, em, u, br.
 */
function sanitizeHtml(html: string): string {
  if (!html) return html;
  return html
    // Remove <span style="...">...</span> — unwrap content, keep inner text
    .replace(/<span\s+style="[^"]*">([\s\S]*?)<\/span>/gi, "$1")
    // Remove any remaining empty spans
    .replace(/<span\s*>([\s\S]*?)<\/span>/gi, "$1")
    // Remove style attributes from any remaining tags
    .replace(/\s+style="[^"]*"/gi, "");
}

const COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink", value: "#ec4899" },
];

export function RichTextToolbarButtons({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5">
      <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
        <span style={{ fontWeight: 700, fontSize: 13 }}>B</span>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
        <span style={{ fontWeight: 500, fontSize: 13, fontStyle: "italic" }}>I</span>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
        <span style={{ fontWeight: 500, fontSize: 13, textDecoration: "underline" }}>U</span>
      </ToolbarButton>
      <ColorPicker editor={editor} />
      <div style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
      <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" /></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => { if (editor.can().sinkListItem("listItem")) editor.chain().focus().sinkListItem("listItem").run(); }} title="Indent">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="4" x2="21" y2="4" /><line x1="11" y1="10" x2="21" y2="10" /><line x1="11" y1="16" x2="21" y2="16" /><line x1="3" y1="22" x2="21" y2="22" /><polyline points="3,8 7,13 3,18" /></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => { if (editor.can().liftListItem("listItem")) editor.chain().focus().liftListItem("listItem").run(); }} title="Outdent">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="4" x2="21" y2="4" /><line x1="11" y1="10" x2="21" y2="10" /><line x1="11" y1="16" x2="21" y2="16" /><line x1="3" y1="22" x2="21" y2="22" /><polyline points="7,8 3,13 7,18" /></svg>
      </ToolbarButton>
      <div style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal line">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12" /></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V4h16v3" />
          <path d="M9 20h6" />
          <path d="M12 4v16" />
          <line x1="3" y1="21" x2="21" y2="3" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

export function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 26,
        height: 26,
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-faint)",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "var(--text-tertiary)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "var(--text-faint)";
      }}
    >
      {children}
    </button>
  );
}

export function ColorPicker({ editor }: { editor: Editor }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton
        onClick={() => setIsOpen((v) => !v)}
        title="Text color"
        active={isOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h16" />
          <path d="M9.5 4h5l4 12H5.5z" fill="none" />
        </svg>
      </ToolbarButton>
      {isOpen && (
        <div
          className="absolute left-0 top-8 z-30 flex gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-2 shadow-xl"
        >
          {COLORS.map((c) => (
            <button
              key={c.label}
              title={c.label}
              onClick={() => {
                if (c.value) {
                  editor.chain().focus().setColor(c.value).run();
                } else {
                  editor.chain().focus().unsetColor().run();
                }
                setIsOpen(false);
              }}
              className="flex items-center justify-center transition-transform hover:scale-125"
              style={{
                width: 18,
                height: 18,
                background: c.value || "var(--text-primary)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  label,
  titleValue,
  onTitleChange,
  onEditorReady,
  contextLabel,
  borderless,
  hideToolbar,
  onEditor,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  titleValue?: string;
  onTitleChange?: (title: string) => void;
  /** Called once with a getter function that returns the current plain-text selection. */
  onEditorReady?: (getSelection: () => string) => void;
  /** Small label shown in the toolbar (e.g. "Section Content", "Section Notes") */
  contextLabel?: string;
  /** When true, removes outer border/radius/bg — use when the editor is already inside a container. */
  borderless?: boolean;
  /** When true, hides the built-in toolbar so the parent can render its own. */
  hideToolbar?: boolean;
  /** Called with the editor instance once it's ready, so the parent can render external toolbar buttons. */
  onEditor?: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
      }),
      Underline,
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: placeholder ?? "Start writing…",
      }),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(sanitizeHtml(ed.getHTML()));
    },
  });

  // Sync external content changes (e.g. switching chapters)
  const lastExternalContent = useRef(content);
  useEffect(() => {
    if (!editor) return;
    const clean = sanitizeHtml(content);
    if (clean !== lastExternalContent.current) {
      lastExternalContent.current = clean;
      if (sanitizeHtml(editor.getHTML()) !== clean) {
        editor.commands.setContent(clean || "", { emitUpdate: false });
      }
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      lastExternalContent.current = editor.getHTML();
    };
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor]);

  // Expose selection getter to parent
  useEffect(() => {
    if (!editor || !onEditorReady) return;
    onEditorReady(() => {
      const { from, to } = editor.state.selection;
      if (from === to) return "";
      return editor.state.doc.textBetween(from, to, "\n");
    });
  }, [editor, onEditorReady]);

  // Expose editor instance to parent
  useEffect(() => {
    if (editor && onEditor) onEditor(editor);
  }, [editor, onEditor]);

  if (!editor) return null;

  return (
    <div className={`flex h-full flex-col transition-colors ${borderless ? "" : "rounded-md border border-[var(--border-default)] bg-[var(--overlay-card)] focus-within:border-[rgba(90,154,245,0.35)]"}`}>
      {/* Toolbar */}
      {!hideToolbar && <div
        className="shrink-0 flex items-center border-b border-[var(--border-default)] px-3"
        style={{ height: 46 }}
      >
        <span className="text-[13px] font-medium pl-1 shrink-0 mr-auto" style={{ color: "var(--text-primary)" }}>
          {contextLabel || "Composer"}
        </span>
        <RichTextToolbarButtons editor={editor} />
      </div>}

      {/* Section title + Editor content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {label && (
          <div className="px-5 pt-4 pb-1">
            <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
