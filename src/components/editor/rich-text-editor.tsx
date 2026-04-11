"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useEffect, useRef } from "react";

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

function ToolbarButton({
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

function ColorPicker({ editor }: { editor: Editor }) {
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
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  titleValue?: string;
  onTitleChange?: (title: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
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
      onChange(ed.getHTML());
    },
  });

  // Sync external content changes (e.g. switching chapters)
  const lastExternalContent = useRef(content);
  useEffect(() => {
    if (!editor) return;
    if (content !== lastExternalContent.current) {
      lastExternalContent.current = content;
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content || "", { emitUpdate: false });
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

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col rounded-md border border-[var(--border-default)] bg-[rgba(255,255,255,0.03)] transition-colors focus-within:border-[rgba(90,154,245,0.35)]">
      {/* Toolbar */}
      <div
        className="shrink-0 flex items-center border-b border-[var(--border-default)] px-3"
        style={{ height: 40 }}
      >
        <span className="text-[12px] font-medium pl-1 shrink-0 mr-auto" style={{ color: "var(--text-faint)" }}>
          Composer
        </span>
        <div className="flex items-center gap-0.5">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <span style={{ fontWeight: 700, fontSize: 13 }}>B</span>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <span style={{ fontWeight: 500, fontSize: 13, fontStyle: "italic" }}>I</span>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <span style={{ fontWeight: 500, fontSize: 13, textDecoration: "underline" }}>U</span>
        </ToolbarButton>

        <ColorPicker editor={editor} />

        <div style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />

        <ToolbarButton
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title="Clear formatting"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
            <line x1="3" y1="21" x2="21" y2="3" />
          </svg>
        </ToolbarButton>
        </div>
      </div>

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
