import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.content !== "string" || !body.content.trim()) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  const content: string = body.content.trim();
  const chunkId: string | null = typeof body.chunk_id === "string" ? body.chunk_id : null;
  const bookTitle: string = typeof body.bookTitle === "string" ? body.bookTitle : "this book";
  const chapters: { title: string; sections: { title: string }[] }[] = Array.isArray(body.chapters) ? body.chapters : [];
  const maxSuggestions: number = typeof body.max_suggestions === "number" ? body.max_suggestions : 5;

  const chapterList = chapters.length > 0
    ? chapters.map((ch) => `- ${ch.title}${ch.sections.length > 0 ? ": " + ch.sections.map((s) => s.title).join(", ") : ""}`).join("\n")
    : "No chapters defined yet.";

  const prompt = `You are a book writing assistant. Analyze the following source material and suggest how excerpts or ideas from it could fit into the book "${bookTitle}".

Book structure:
${chapterList}

Source material:
---
${content.slice(0, 6000)}
---

Return a JSON array of 1-${maxSuggestions} suggestions. Each suggestion should have:
- "chapter_fit": the chapter or topic area this could belong to
- "section_fit": (optional) a more specific section if applicable
- "explanation": a 1-2 sentence explanation of why this fits
- "excerpt": (optional) a short relevant excerpt from the source material

Return ONLY the JSON array, no other text. Example:
[{"chapter_fit":"Discipline","section_fit":"Daily Habits","explanation":"This passage discusses building routines that align with the chapter on discipline.","excerpt":"The key to consistency is..."}]`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw = response.output_text?.trim() || "[]";
    let suggestions: { id: number; chunk_id: string | null; chapter_fit: string; section_fit?: string; explanation: string; excerpt?: string; is_liked: boolean; is_disliked: boolean; is_hidden: boolean; is_deleted: boolean }[] = [];
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned);
      suggestions = Array.isArray(parsed) ? parsed.map((s: Record<string, unknown>, i: number) => ({
        id: Date.now() + i,
        chunk_id: chunkId,
        chapter_fit: String(s.chapter_fit ?? "General"),
        section_fit: s.section_fit ? String(s.section_fit) : undefined,
        explanation: String(s.explanation ?? ""),
        excerpt: s.excerpt ? String(s.excerpt) : undefined,
        is_liked: false,
        is_disliked: false,
        is_hidden: false,
        is_deleted: false,
      })) : [];
    } catch {
      suggestions = [];
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("OpenAI request failed:", err);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
