import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message: string = body.message.trim();
  const chapter: string = typeof body.chapter === "string" ? body.chapter : "this chapter";
  const bookTitle: string = typeof body.bookTitle === "string" ? body.bookTitle : "this book";
  const projectId: string | null = typeof body.project_id === "string" ? body.project_id : null;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  // Save user message to Supabase
  try {
    await supabase.from("messages").insert([
      {
        project_id: projectId,
        chapter_id: body.chapter || null,
        role: "user",
        message: message,
      },
    ]);
  } catch (err) {
    console.error("Supabase insert (user) failed:", err);
  }

  const prompt = `You are a book writing assistant helping an author brainstorm content for their book.
Your role is to be helpful, clear, and structured — like a good editor and creative collaborator in one.
Focus on helping the author develop ideas, find narrative clarity, and structure their thinking.
Keep responses concise but substantive. Avoid over-explaining. Speak to the author directly.

Respond in plain text only. Do not use markdown. Do not use bold or italic formatting. Do not use bullet points or numbered lists unless the author explicitly asks for them. Write in clean, natural prose that reads well in a conversational chat interface.

Book: "${bookTitle}"
Chapter: ${chapter}

${message}`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const reply = response.output_text?.trim() || "I wasn't able to generate a response. Please try again.";

    // Save AI response to Supabase
    try {
      await supabase.from("messages").insert([
        {
          project_id: projectId,
          chapter_id: body.chapter || null,
          role: "assistant",
          message: reply,
        },
      ]);
    } catch (err) {
      console.error("Supabase insert (assistant) failed:", err);
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("OpenAI request failed:", err);
    return NextResponse.json({ error: "OpenAI request failed" }, { status: 500 });
  }
}
