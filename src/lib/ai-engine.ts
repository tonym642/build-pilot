/**
 * AI Engine — instruction stack, context formatters, and message builder.
 *
 * Every OpenAI request should go through `buildAiMessages()` so the model
 * always receives a consistent, layered instruction set.
 */

/* ─── Types ────────────────────────────────────────────────────── */

export type ModeKey = "Book" | "App" | "Business" | "Music";

export type ModeStageKey = "master" | "compose" | "manuscript" | "publish";

export type StageKey = ModeStageKey | "structuring";

export type StageInstructions = Record<ModeStageKey, string>;

export type AIEngineConfig = {
  global: string;
  structuring: string;
} & Record<ModeKey, StageInstructions>;

export type ProjectContext = {
  title: string;
  subtitle?: string;
  author?: string;
  genre?: string;
  tone?: string;
  audience?: string;
  synopsis?: string;
  synopsisApproved?: boolean;
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
  structuring: "",
  Book: { ...EMPTY_STAGE },
  App: { ...EMPTY_STAGE },
  Business: { ...EMPTY_STAGE },
  Music: { ...EMPTY_STAGE },
};

/* Storage keys kept for reference; data now lives in Supabase. */

/* ─── Storage helpers ──────────────────────────────────────────── */

/** Load the full AI Engine config from Supabase via API. */
export async function loadAIEngineConfig(): Promise<AIEngineConfig> {
  const config = { ...EMPTY_AI_ENGINE_CONFIG };
  try {
    const res = await fetch("/api/ai-engine");
    if (!res.ok) return config;
    const row = await res.json();
    if (row.global_instruction) config.global = row.global_instruction;
    if (row.structuring_instructions) config.structuring = row.structuring_instructions;
    if (row.mode_instructions && typeof row.mode_instructions === "object") {
      for (const key of ["Book", "App", "Business", "Music"] as ModeKey[]) {
        if (row.mode_instructions[key]) {
          config[key] = { ...EMPTY_STAGE, ...row.mode_instructions[key] };
        }
      }
    }
  } catch {
    // ignore — return defaults
  }
  return config;
}

/* ─── Instruction stack ────────────────────────────────────────── */

export type InstructionStack = {
  global: string;
  master: string;
  page: string;
};

/**
 * Returns the three-layer instruction stack for a given mode and page.
 *
 * - Structuring page: global + structuring instructions (no mode master/page)
 * - Compose/Manuscript/Publish: global + mode master + page instructions (no structuring)
 */
export function getInstructionStack(
  mode: ModeKey,
  page: StageKey,
  config: AIEngineConfig,
): InstructionStack {
  if (page === "structuring") {
    return {
      global: config.global || "",
      master: config.structuring || "",
      page: "",
    };
  }
  return {
    global: config.global || "",
    master: config[mode]?.master || "",
    page: page !== "master" ? (config[mode]?.[page as ModeStageKey] || "") : "",
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
  synopsis_approved?: boolean;
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
    synopsisApproved: bookInfo.synopsis_approved ?? false,
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
    if (page === "structuring") {
      messages.push({
        role: "system",
        content:
          "You are a book structuring assistant. Your role is to help the author brainstorm, " +
          "ask clarifying questions about their vision, develop a synopsis, and generate a chapter " +
          "and section outline. Do NOT write prose or section content. Focus on structure, planning, " +
          "and organizing the book's architecture. Ask questions before making assumptions.",
      });
    } else {
      messages.push({
        role: "system",
        content:
          "You are a helpful creative assistant. Be clear, concise, and structured.",
      });
    }
  }

  // ─── Structuring phase enforcement (V1) ─────────────────────
  if (page === "structuring") {
    const hasApprovedSynopsis = !!projectContext.synopsisApproved;
    const userTurns = (history ?? []).filter((h) => h.role === "user").length;
    const userPromptLower = userPrompt.toLowerCase();
    const explicitSynopsisRequest = /\b(generate|create|write|draft|make)\b.*\bsynopsis\b/i.test(userPromptLower)
      || /\byou have enough\b/i.test(userPromptLower)
      || /\benough info\b/i.test(userPromptLower)
      || /\bgo ahead\b/i.test(userPromptLower)
      || /\bproceed\b/i.test(userPromptLower)
      || /\byes\b/i.test(userPromptLower);
    const explicitChapterRequest = /\b(generate|create|write|draft|make)\b.*\b(outline|chapters|sections|structure)\b/i.test(userPromptLower);
    const hasSynopsis = !!projectContext.synopsis?.trim();

    // Detect book type from conversation context
    const allText = (history ?? []).map((h) => h.text).join(" ") + " " + userPrompt;
    const fictionSignals = /\b(fiction|novel|story|character|protagonist|antagonist|plot|narrative|scene|dialogue|fantasy|thriller|romance|mystery|sci-fi|horror)\b/i.test(allText);
    const nonfictionSignals = /\b(nonfiction|non-fiction|self-help|guide|how.to|educational|business|memoir|autobiography|textbook|manual|reference|teaching|lessons|framework|methodology|principles)\b/i.test(allText);

    const FICTION_REQUIREMENTS =
      "REQUIRED INPUTS for fiction before generating synopsis or outline:\n" +
      "- Premise or core concept\n" +
      "- Storyline or rough plot (beginning, middle, end direction)\n" +
      "- Main characters (at least protagonist)\n" +
      "- Setting or world\n" +
      "- Ending direction if known\n" +
      "- Themes or message if relevant\n\n" +
      "If any of these are missing, ask the user to provide them. " +
      "Say something like: 'Before I structure this story, I need your current storyline, main characters, and any major plot points you already know.'\n" +
      "Help them BUILD their story foundation — do NOT invent a full book from a vague prompt.";

    const NONFICTION_REQUIREMENTS =
      "REQUIRED INPUTS for nonfiction before generating synopsis or outline:\n" +
      "- Core topic\n" +
      "- Purpose of the book\n" +
      "- Target audience\n" +
      "- List of main topics or rough chapter ideas\n" +
      "- Preferred order if known (chronological, thematic, progressive)\n" +
      "- Tone and style if relevant\n\n" +
      "If the topic list is missing or weak, help the user build and organize it first. " +
      "Say something like: 'Before I structure this book, give me your main topic list or rough chapter ideas. If it\\'s incomplete, I\\'ll help you organize it.'\n" +
      "Help them ORGANIZE their existing knowledge — do NOT generate content from thin air.";

    const HYBRID_REQUIREMENTS =
      "This appears to be a HYBRID book (mixing story elements with teaching/informational content). " +
      "Ask which parts are story-driven vs teaching/informational, then collect:\n" +
      "- For story parts: premise, characters, plot direction\n" +
      "- For informational parts: core topics, audience, structure preference\n" +
      "Help the user clarify the balance and organize both dimensions.";

    if (hasApprovedSynopsis && explicitChapterRequest) {
      // Phase 6: Chapter/section generation — only after synopsis is approved
      messages.push({
        role: "system",
        content:
          "You are in Structuring mode. The synopsis has been approved.\n\n" +
          "Generate a chapter and section outline based on the approved synopsis and foundation material.\n" +
          "Base your output on what the user has provided — do NOT invent plot points, characters, or topics.\n\n" +
          "Use this exact format:\n\n" +
          "Chapter 1: Title\n- Section 1: Title\n- Section 2: Title\n\nChapter 2: Title\n- Section 1: Title\n\n" +
          "Do NOT write prose or section content. Focus on structure only.",
      });
    } else if (explicitSynopsisRequest && userTurns >= 1) {
      // Phase 4: Synopsis generation — user explicitly requested it after providing material
      messages.push({
        role: "system",
        content:
          "You are in Structuring mode. The user has confirmed they want a synopsis generated.\n\n" +
          "Generate a detailed synopsis based on the foundation material the user has provided.\n" +
          "The synopsis should cover the full arc/scope of the book.\n" +
          "Base it strictly on what the user shared — do NOT invent major plot points, characters, or topics.\n\n" +
          "Do NOT generate chapter outlines or section lists yet — only the synopsis.\n" +
          "Do NOT write prose or section content.",
      });
    } else if (userTurns < 1) {
      // Phase 1: First interaction — determine book type and collect foundation
      messages.push({
        role: "system",
        content:
          "CRITICAL INSTRUCTION: You are a book structuring assistant in INTAKE phase.\n\n" +
          "This is for users who ALREADY HAVE a solid book idea and need help organizing, refining, and enhancing it. " +
          "You are NOT building a book from scratch from a one-line prompt.\n\n" +
          "Your FIRST task: determine the book type (fiction, nonfiction, or hybrid).\n" +
          "Then ask 3-5 targeted questions to collect the right foundational material.\n\n" +
          "If the input clearly suggests fiction:\n" + FICTION_REQUIREMENTS + "\n\n" +
          "If the input clearly suggests nonfiction:\n" + NONFICTION_REQUIREMENTS + "\n\n" +
          "If unclear or hybrid:\n" + HYBRID_REQUIREMENTS + "\n\n" +
          "Do NOT generate any synopsis, outline, or chapter list yet.\n" +
          "Respond ONLY with targeted questions to gather the source material.",
      });
    } else {
      // Phase 2/3: Ongoing gathering — continue collecting, offer synopsis when ready
      const typeGuide = fictionSignals && !nonfictionSignals
        ? FICTION_REQUIREMENTS
        : nonfictionSignals && !fictionSignals
        ? NONFICTION_REQUIREMENTS
        : fictionSignals && nonfictionSignals
        ? HYBRID_REQUIREMENTS
        : FICTION_REQUIREMENTS + "\n\n" + NONFICTION_REQUIREMENTS;

      const synopsisHint = hasSynopsis
        ? "\n\nA synopsis already exists. If the user wants to refine it, help them. " +
          "If they want chapter/section generation, remind them to approve the synopsis first in the Book Info page."
        : "";

      messages.push({
        role: "system",
        content:
          "You are in Structuring mode, GATHERING phase. The user has provided some information.\n\n" +
          "Review what has been shared so far against these requirements:\n" + typeGuide + "\n\n" +
          "If important foundation pieces are still missing, ask follow-up questions to fill gaps.\n" +
          "If you have enough material, summarize what you understand and ask if the user wants to generate a synopsis.\n\n" +
          "Do NOT generate a synopsis unless the user explicitly asks " +
          "(e.g. 'generate synopsis', 'create synopsis', 'go ahead', 'proceed', 'yes').\n" +
          "Do NOT generate chapter outlines or section lists — those require an approved synopsis.\n" +
          "Do NOT write prose or section content.\n" +
          "Help organize what the user already has — do NOT invent content." + synopsisHint,
      });
    }
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
