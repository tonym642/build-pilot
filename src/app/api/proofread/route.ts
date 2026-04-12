import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.content !== "string" || !body.content.trim()) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  const sectionTitle = body.section_title ?? "this section";

  const prompt = `You are a professional book editor doing a final proofread of a section titled "${sectionTitle}".

Review the following text and provide ONLY suggestions where a change is actually needed. Focus on:
- Grammar and spelling errors
- Awkward phrasing or unclear sentences
- Consistency in tone and style
- Redundant or unnecessary words
- Punctuation issues

IMPORTANT RULES:
- Only include suggestions where the original_text and suggested_text are DIFFERENT.
- Do NOT include entries where the text is already correct or needs no changes.
- Do NOT include suggestions that say "no change needed" or where you are confirming text is fine.
- Every suggestion must propose a concrete edit — a real change to the text.

Return your response as a valid JSON array of suggestion objects. Each suggestion must have exactly these fields:
- "original_text": the exact text from the content that should be changed (must be a verbatim substring)
- "suggested_text": the improved replacement text (MUST be different from original_text)
- "reason": a brief explanation of why this change improves the text

If the text is already well-written and needs no changes, return an empty array: []

Return ONLY the JSON array, no other text or markdown formatting.

Text to review:
${body.content}`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw = response.output_text?.trim() ?? "[]";

    // Parse the JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(raw);
      if (!Array.isArray(suggestions)) suggestions = [];
    } catch {
      console.error("Failed to parse AI response as JSON:", raw);
      suggestions = [];
    }

    // Filter out suggestions where no actual change is proposed
    suggestions = suggestions.filter(
      (s: { original_text?: string; suggested_text?: string }) =>
        s.original_text && s.suggested_text && s.original_text !== s.suggested_text
    );

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("OpenAI proofread request failed:", err);
    return NextResponse.json({ error: "AI proofread request failed." }, { status: 500 });
  }
}
