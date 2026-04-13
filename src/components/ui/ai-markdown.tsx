"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AiMarkdown({ children }: { children: string }) {
  return (
    <div className="ai-markdown text-[13px] leading-relaxed text-[var(--text-secondary)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
