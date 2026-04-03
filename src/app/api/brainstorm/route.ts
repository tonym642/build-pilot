import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
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
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("OpenAI request failed:", err);
    return NextResponse.json({ error: "OpenAI request failed" }, { status: 500 });
  }
}
