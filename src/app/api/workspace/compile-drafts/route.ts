import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Support both chunk-based (new) and item-based (legacy) payloads
  const chunks: { chunk_id?: string; item_title: string; chunk_title: string; chunk_text: string }[] = [];

  if (body?.chunks && Array.isArray(body.chunks)) {
    // New chunk-based payload
    for (const c of body.chunks) {
      chunks.push({
        chunk_id: c.chunk_id ?? undefined,
        item_title: String(c.item_title ?? ""),
        chunk_title: String(c.chunk_title ?? ""),
        chunk_text: String(c.chunk_text ?? ""),
      });
    }
  } else if (body?.items && Array.isArray(body.items)) {
    // Legacy item-based payload (backward compat)
    for (const item of body.items) {
      chunks.push({
        item_title: String(item.title ?? ""),
        chunk_title: String(item.title ?? ""),
        chunk_text: String(item.content ?? ""),
      });
    }
  }

  if (chunks.length === 0) {
    return NextResponse.json({ error: "At least one chunk or item is required." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 500 });
  }

  const bookTitle: string = typeof body.bookTitle === "string" ? body.bookTitle : "this book";

  // Build source document string from chunks, capped to avoid token limits
  let totalChars = 0;
  const maxChars = 18000;
  const sourceDocs: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const label = c.item_title !== c.chunk_title
      ? `${c.item_title} > ${c.chunk_title}`
      : c.chunk_title || `Chunk ${i + 1}`;
    const text = c.chunk_text.slice(0, Math.max(0, maxChars - totalChars));
    if (!text) break;
    sourceDocs.push(`--- ${label} ---\n${text}`);
    totalChars += text.length;
    if (totalChars >= maxChars) break;
  }

  const prompt = `You are a book writing assistant helping organize source material for the book "${bookTitle}".

You have been given ${chunks.length} content chunks from ${new Set(chunks.map((c) => c.item_title)).size} source documents. Your job is to:
1. Identify the major topics or themes across all chunks
2. Group related content by topic
3. Detect repeated or overlapping ideas
4. Merge duplicate content into a single, stronger version
5. Preserve the best insights from each source

Source chunks:
${sourceDocs.join("\n\n")}

Return a JSON array of topic objects. Each topic should have:
- "title": the topic or theme name
- "core_idea": a 1-2 sentence summary of the core idea
- "best_insight": the single best insight or quote extracted from the sources
- "merged_version": a merged, deduplicated paragraph combining the best material on this topic

Return ONLY the JSON array, no other text. Aim for 3-7 topics. Example:
[{"title":"Discipline","core_idea":"Discipline is the foundation of meaningful progress.","best_insight":"True discipline is not about punishment but about choosing long-term fulfillment over short-term comfort.","merged_version":"Discipline forms the backbone of any lasting achievement..."}]`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw = response.output_text?.trim() || "[]";
    let topics: { title: string; core_idea: string; best_insight: string; merged_version: string }[] = [];
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned);
      topics = Array.isArray(parsed) ? parsed.map((t: Record<string, unknown>) => ({
        title: String(t.title ?? "Untitled Topic"),
        core_idea: String(t.core_idea ?? ""),
        best_insight: String(t.best_insight ?? ""),
        merged_version: String(t.merged_version ?? ""),
      })) : [];
    } catch {
      topics = [];
    }

    return NextResponse.json({ topics });
  } catch (err) {
    console.error("OpenAI request failed:", err);
    return NextResponse.json({ error: "AI compilation failed" }, { status: 500 });
  }
}
