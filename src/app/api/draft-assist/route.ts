import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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
  const chapter: string = typeof body.chapter === "string" ? body.chapter : "this chapter";
  const bookTitle: string = typeof body.bookTitle === "string" ? body.bookTitle : "this book";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  const prompt = `You are an editor helping an author refine content for their book.

Book: "${bookTitle}"
Chapter: ${chapter}

${ACTION_INSTRUCTIONS[action]}

Respond in plain text only. Do not use markdown, bold, italic, or bullet points. Write clean natural prose.

Text to ${action}:
${content}`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const result = response.output_text?.trim() || "";
    return NextResponse.json({ result });
  } catch (err) {
    console.error("Draft assist failed:", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
