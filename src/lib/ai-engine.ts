/**
 * AI Engine — instruction stack, context formatters, and message builder.
 *
 * Every OpenAI request should go through `buildAiMessages()` so the model
 * always receives a consistent, layered instruction set.
 */

/* ─── Types ────────────────────────────────────────────────────── */

export type ModeKey = "Book" | "App" | "Business" | "Music";

export type StageKey = "master" | "compose" | "manuscript" | "publish";

export type StageInstructions = Record<StageKey, string>;

export type AIEngineConfig = {
  global: string;
} & Record<ModeKey, StageInstructions>;

export type ProjectContext = {
  title: string;
  subtitle?: string;
  author?: string;
  genre?: string;
  tone?: string;
  audience?: string;
  synopsis?: string;
  oneLineHook?: string;
};

export type WorkContext = {
  currentPage: string;
  selectedSection?: string;
  selectedChapter?: string;
  editorContent?: string;
  selectedText?: string;
  fullSectionText?: string;
};

export type AiMessageEntry = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatHistoryEntry = {
  role: "user" | "assistant";
  text: string;
};

/* ─── Defaults ─────────────────────────────────────────────────── */

const EMPTY_STAGE: StageInstructions = {
  master: "",
  compose: "",
  manuscript: "",
  publish: "",
};

export const EMPTY_AI_ENGINE_CONFIG: AIEngineConfig = {
  global: "",
  Book: { ...EMPTY_STAGE },
  App: { ...EMPTY_STAGE },
  Business: { ...EMPTY_STAGE },
  Music: { ...EMPTY_STAGE },
};

const AI_ENGINE_STORAGE_KEY = "build-pilot-ai-engine";
const AI_ENGINE_GLOBAL_KEY = "build-pilot-ai-engine-global";

/* ─── Storage helpers ──────────────────────────────────────────── */

/** Load the full AI Engine config from localStorage (client-side only). */
export function loadAIEngineConfig(): AIEngineConfig {
  const config = { ...EMPTY_AI_ENGINE_CONFIG };
  try {
    const globalVal = localStorage.getItem(AI_ENGINE_GLOBAL_KEY);
    if (globalVal) config.global = globalVal;

    const modesVal = localStorage.getItem(AI_ENGINE_STORAGE_KEY);
    if (modesVal) {
      const parsed = JSON.parse(modesVal);
      for (const key of ["Book", "App", "Business", "Music"] as ModeKey[]) {
        if (parsed[key]) {
          config[key] = { ...EMPTY_STAGE, ...parsed[key] };
        }
      }
    }
  } catch {
    // ignore
  }
  return config;
}

/** Save the global instruction to localStorage. */
export function saveGlobalInstruction(value: string): void {
  localStorage.setItem(AI_ENGINE_GLOBAL_KEY, value);
}

/* ─── Instruction stack ────────────────────────────────────────── */

export type InstructionStack = {
  global: string;
  master: string;
  page: string;
};

/**
 * Returns the three-layer instruction stack for a given mode and page.
 * Only the active page instruction is included — never all pages together.
 */
export function getInstructionStack(
  mode: ModeKey,
  page: StageKey,
  config: AIEngineConfig,
): InstructionStack {
  return {
    global: config.global || "",
    master: config[mode]?.master || "",
    page: page !== "master" ? (config[mode]?.[page] || "") : "",
  };
}

/* ─── Context formatters ───────────────────────────────────────── */

/**
 * Format project metadata into a human-readable system context block.
 */
export function formatProjectContext(ctx: ProjectContext): string {
  const lines: string[] = [];
  lines.push(`Book: "${ctx.title || "Untitled"}"`);
  if (ctx.subtitle) lines.push(`Subtitle: ${ctx.subtitle}`);
  if (ctx.author) lines.push(`Author: ${ctx.author}`);
  if (ctx.genre) lines.push(`Genre: ${ctx.genre}`);
  if (ctx.tone) lines.push(`Tone: ${ctx.tone}`);
  if (ctx.audience) lines.push(`Audience: ${ctx.audience}`);
  if (ctx.oneLineHook) lines.push(`Hook: ${ctx.oneLineHook}`);
  if (ctx.synopsis) lines.push(`Synopsis: ${ctx.synopsis}`);
  return lines.join("\n");
}

/**
 * Format current working context into a human-readable block.
 */
export function formatWorkContext(ctx: WorkContext): string {
  const lines: string[] = [];
  lines.push(`Current page: ${ctx.currentPage || "None"}`);
  if (ctx.selectedChapter) lines.push(`Chapter: ${ctx.selectedChapter}`);
  if (ctx.selectedSection) lines.push(`Section: ${ctx.selectedSection}`);
  if (ctx.selectedText) {
    lines.push(`Selected text:\n${ctx.selectedText}`);
  }
  if (!ctx.selectedText && ctx.fullSectionText) {
    const trimmed = ctx.fullSectionText.slice(0, 4000);
    lines.push(`Full Section:\n${trimmed}${ctx.fullSectionText.length > 4000 ? "\n[truncated]" : ""}`);
  }
  if (ctx.editorContent) {
    const trimmed = ctx.editorContent.slice(0, 2000);
    lines.push(`Current content:\n${trimmed}${ctx.editorContent.length > 2000 ? "\n[truncated]" : ""}`);
  }
  return lines.join("\n");
}

/* ─── Context resolvers ────────────────────────────────────────── */

/**
 * Resolve project context from a project/bookInfo-shaped object.
 */
export function resolveProjectContext(bookInfo: {
  title?: string;
  subtitle?: string;
  author?: string;
  genre?: string;
  tone?: string;
  audience?: string;
  synopsis?: string;
  one_line_hook?: string;
}, projectName?: string): ProjectContext {
  return {
    title: bookInfo.title || projectName || "Untitled",
    subtitle: bookInfo.subtitle || undefined,
    author: bookInfo.author || undefined,
    genre: bookInfo.genre || undefined,
    tone: bookInfo.tone || undefined,
    audience: bookInfo.audience || undefined,
    synopsis: bookInfo.synopsis || undefined,
    oneLineHook: bookInfo.one_line_hook || undefined,
  };
}

/**
 * Resolve work context from the current editor state.
 */
export function resolveWorkContext(opts: {
  stage: string;
  chapterTitle?: string;
  sectionTitle?: string;
  editorContent?: string;
}): WorkContext {
  return {
    currentPage: opts.stage || "Compose",
    selectedChapter: opts.chapterTitle || undefined,
    selectedSection: opts.sectionTitle || undefined,
    editorContent: opts.editorContent || undefined,
  };
}

/* ─── Message builder ──────────────────────────────────────────── */

const MAX_HISTORY_TURNS = 10;

/**
 * Build the full message array for an OpenAI request.
 *
 * Order:
 *  1. system: global instruction
 *  2. system: mode master instruction
 *  3. system: active page instruction
 *  4. system: project context
 *  5. system: current work context
 *  6. recent chat history (user/assistant pairs)
 *  7. user: latest prompt
 */
export function buildAiMessages(opts: {
  mode: ModeKey;
  page: StageKey;
  config: AIEngineConfig;
  projectContext: ProjectContext;
  workContext: WorkContext;
  history?: ChatHistoryEntry[];
  userPrompt: string;
}): AiMessageEntry[] {
  const { mode, page, config, projectContext, workContext, history, userPrompt } = opts;
  const stack = getInstructionStack(mode, page, config);
  const messages: AiMessageEntry[] = [];

  // 1. Global instruction
  if (stack.global) {
    messages.push({ role: "system", content: stack.global });
  }

  // 2. Mode master instruction
  if (stack.master) {
    messages.push({ role: "system", content: stack.master });
  }

  // 3. Active page instruction
  if (stack.page) {
    messages.push({ role: "system", content: stack.page });
  }

  // 4. Fallback: if no instructions at all, provide a sensible default
  if (!stack.global && !stack.master && !stack.page) {
    messages.push({
      role: "system",
      content:
        "You are a helpful creative assistant. Be clear, concise, and structured.",
    });
  }

  // Always enforce plain text output
  messages.push({
    role: "system",
    content:
      "IMPORTANT: Respond in plain text only. " +
      "Do not use HTML tags, markdown, bold, italic, or any formatting. " +
      "Do not wrap text in <p>, <em>, <strong>, <span>, or any other tags. " +
      "Use line breaks to separate paragraphs. Write clean, natural prose.",
  });

  // 4. Project context
  const projCtx = formatProjectContext(projectContext);
  if (projCtx) {
    messages.push({ role: "system", content: `[Project Context]\n${projCtx}` });
  }

  // 5. Work context
  const workCtx = formatWorkContext(workContext);
  if (workCtx) {
    messages.push({ role: "system", content: `[Work Context]\n${workCtx}` });
  }

  // 5b. Selected text instruction
  if (workContext.selectedText) {
    messages.push({
      role: "system",
      content:
        "The user has highlighted specific text in the editor. " +
        "Focus ONLY on the selected text provided above. " +
        "Do not rewrite the entire section or document. " +
        "Only modify, improve, or respond about the selected portion.",
    });
  } else if (workContext.fullSectionText) {
    messages.push({
      role: "system",
      content:
        "If no selected text is provided, treat the entire section as the target for modification. " +
        "The full section content has been provided above. " +
        "When asked to rewrite, improve, or modify, apply changes to the entire section.",
    });
  }

  // 6. Recent chat history (trimmed)
  if (history && history.length > 0) {
    const recent = history.slice(-MAX_HISTORY_TURNS);
    for (const entry of recent) {
      messages.push({
        role: entry.role === "user" ? "user" : "assistant",
        content: entry.text,
      });
    }
  }

  // 7. User prompt
  messages.push({ role: "user", content: userPrompt });

  return messages;
}

/**
 * Flatten message entries into a single prompt string for APIs
 * that use a simple `input` field (like openai.responses.create).
 */
export function flattenMessagesToPrompt(messages: AiMessageEntry[]): string {
  return messages
    .map((m) => {
      if (m.role === "system") return m.content;
      if (m.role === "assistant") return `Assistant: ${m.content}`;
      return m.content;
    })
    .join("\n\n");
}

/**
 * Strip all HTML tags from a string and convert to plain text.
 * Converts </p>, <br> to newlines so paragraph structure is preserved as line breaks.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return html;
  return html
    // Convert closing </p> and <br> to newlines
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Remove all remaining HTML tags
    .replace(/<[^>]*>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse excessive blank lines (3+ newlines → 2)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
