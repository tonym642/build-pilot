import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import {
  buildAiMessages,
  flattenMessagesToPrompt,
  stripHtmlToPlainText,
  type ModeKey,
  type StageKey,
  type AIEngineConfig,
  type ProjectContext,
  type WorkContext,
  type ChatHistoryEntry,
  EMPTY_AI_ENGINE_CONFIG,
} from "@/lib/ai-engine";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message: string = body.message.trim();
  const projectId: string | null = typeof body.project_id === "string" ? body.project_id : null;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  // Save user message to Supabase
  let userMsgId: string | null = null;
  try {
    const { data: userRow } = await supabase.from("messages").insert([
      {
        project_id: projectId,
        chapter_id: body.chapter || null,
        role: "user",
        message: message,
      },
    ]).select("id").single();
    userMsgId = userRow?.id ?? null;
  } catch (err) {
    console.error("Supabase insert (user) failed:", err);
  }

  // Build AI Engine config from client payload, or load from Supabase as fallback
  let aiEngineConfig: AIEngineConfig = EMPTY_AI_ENGINE_CONFIG;
  if (body.aiEngine) {
    aiEngineConfig = body.aiEngine;
  } else {
    try {
      const { data: row } = await supabase
        .from("ai_engine_settings")
        .select("global_instruction, mode_instructions, structuring_instructions")
        .limit(1)
        .maybeSingle();
      if (row) {
        aiEngineConfig = {
          ...EMPTY_AI_ENGINE_CONFIG,
          global: row.global_instruction || "",
          structuring: row.structuring_instructions || "",
          ...(row.mode_instructions && typeof row.mode_instructions === "object"
            ? Object.fromEntries(
                (["Book", "App", "Business", "Music"] as ModeKey[])
                  .filter((k) => row.mode_instructions[k])
                  .map((k) => [k, { ...EMPTY_AI_ENGINE_CONFIG[k], ...row.mode_instructions[k] }])
              )
            : {}),
        };
      }
    } catch {
      // use defaults
    }
  }
  const mode: ModeKey = body.mode ?? "Book";
  const page: StageKey = body.page ?? "compose";

  // Build project context
  const projectContext: ProjectContext = body.projectContext ?? {
    title: typeof body.bookTitle === "string" ? body.bookTitle : "this book",
  };

  // Build work context
  const workContext: WorkContext = body.workContext ?? {
    currentPage: page,
    selectedChapter: typeof body.chapter === "string" ? body.chapter : undefined,
  };

  // Build chat history
  const history: ChatHistoryEntry[] = Array.isArray(body.history) ? body.history : [];

  // Assemble the full message stack
  const aiMessages = buildAiMessages({
    mode,
    page,
    config: aiEngineConfig,
    projectContext,
    workContext,
    history,
    userPrompt: message,
  });

  const prompt = flattenMessagesToPrompt(aiMessages);

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const rawReply = response.output_text?.trim() || "I wasn't able to generate a response. Please try again.";
    const reply = stripHtmlToPlainText(rawReply);

    // Save AI response to Supabase
    let aiMsgId: string | null = null;
    try {
      const { data: aiRow } = await supabase.from("messages").insert([
        {
          project_id: projectId,
          chapter_id: body.chapter || null,
          role: "assistant",
          message: reply,
        },
      ]).select("id").single();
      aiMsgId = aiRow?.id ?? null;
    } catch (err) {
      console.error("Supabase insert (assistant) failed:", err);
    }

    return NextResponse.json({ reply, userMsgId, aiMsgId });
  } catch (err) {
    console.error("OpenAI request failed:", err);
    return NextResponse.json({ error: "OpenAI request failed" }, { status: 500 });
  }
}
