import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildAiMessages,
  flattenMessagesToPrompt,
  stripHtmlToPlainText,
  type ModeKey,
  type StageKey,
  type AIEngineConfig,
  type ProjectContext,
  type WorkContext,
  EMPTY_AI_ENGINE_CONFIG,
} from "@/lib/ai-engine";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ACTION_INSTRUCTIONS: Record<string, string> = {
  rewrite:
    "Rewrite the following passage to make it clearer, smoother, and more readable. Preserve the original meaning. Do not add new ideas.",
  expand:
    "Expand the following passage by adding detail, depth, and development. Keep the tone consistent with the original. Do not repeat the original verbatim.",
  shorten:
    "Shorten the following passage to make it more concise. Keep the core meaning and voice. Remove redundancy and filler.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.content !== "string" ||
    !body.content.trim() ||
    !["rewrite", "expand", "shorten"].includes(body.action)
  ) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const content: string = body.content.trim();
  const action: string = body.action;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  // Build AI Engine config from client payload
  const aiEngineConfig: AIEngineConfig = body.aiEngine ?? EMPTY_AI_ENGINE_CONFIG;
  const mode: ModeKey = body.mode ?? "Book";
  const page: StageKey = body.page ?? "compose";

  const projectContext: ProjectContext = body.projectContext ?? {
    title: typeof body.bookTitle === "string" ? body.bookTitle : "this book",
  };

  const workContext: WorkContext = body.workContext ?? {
    currentPage: page,
    selectedChapter: typeof body.chapter === "string" ? body.chapter : undefined,
  };

  // Build instruction-grounded prompt with action
  const actionPrompt = `${ACTION_INSTRUCTIONS[action]}\n\nRespond in plain text only. Do not use markdown, bold, italic, or bullet points. Write clean natural prose.\n\nText to ${action}:\n${content}`;

  const aiMessages = buildAiMessages({
    mode,
    page,
    config: aiEngineConfig,
    projectContext,
    workContext,
    userPrompt: actionPrompt,
  });

  const prompt = flattenMessagesToPrompt(aiMessages);

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const rawResult = response.output_text?.trim() || "";
    const result = stripHtmlToPlainText(rawResult);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("Draft assist failed:", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
