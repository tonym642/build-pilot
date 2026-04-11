import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChunkInput = {
  chunk_id?: string;
  item_title: string;
  chunk_title: string;
  chunk_text: string;
};

/**
 * Step 1 — Classify chunks into topics and detect clusters of similar ideas.
 * Returns a mapping: topic → list of chunk references with similarity notes.
 */
async function classifyAndCluster(
  chunks: ChunkInput[],
  bookTitle: string,
): Promise<{ topic: string; subtopic: string; chunk_ids: string[]; duplicate_count: number }[]> {
  // Build a compact index of chunks for the prompt
  const index = chunks.map((c, i) => {
    const id = c.chunk_id || `c${i}`;
    const label = c.item_title !== c.chunk_title ? `${c.item_title} > ${c.chunk_title}` : c.chunk_title || `Chunk ${i + 1}`;
    // Send first 400 chars of each chunk for classification (saves tokens)
    return `[${id}] ${label}: ${c.chunk_text.slice(0, 400).replace(/\n/g, " ")}`;
  }).join("\n");

  const prompt = `You are organizing source material for the book "${bookTitle}".

Below is an index of ${chunks.length} content chunks. Each line has [chunk_id] label: preview.

${index}

TASK:
1. Identify the major topics/themes (e.g. Discipline, Spirituality, Relationships, Health, Mindset, Emotional Intelligence, Finances, etc.)
2. For each topic, identify a subtopic if applicable (e.g. Daily Habits, Self-Control, Responsibility)
3. Group chunk_ids that discuss the SAME or very similar ideas into clusters
4. Count how many chunks in each cluster say essentially the same thing (duplicate_count)

Return a JSON array. Each object:
{
  "topic": "main topic name",
  "subtopic": "specific subtopic or empty string",
  "chunk_ids": ["id1", "id2", ...],
  "duplicate_count": number
}

Rules:
- A chunk can appear in at most ONE cluster
- Merge truly similar ideas, do not create a cluster for every chunk
- Aim for 4-10 clusters total
- duplicate_count = how many chunks say nearly the same thing (1 means unique)
- Return ONLY the JSON array`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const raw = response.output_text?.trim() || "[]";
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c: Record<string, unknown>) => ({
      topic: String(c.topic ?? "General"),
      subtopic: String(c.subtopic ?? ""),
      chunk_ids: Array.isArray(c.chunk_ids) ? c.chunk_ids.map(String) : [],
      duplicate_count: typeof c.duplicate_count === "number" ? c.duplicate_count : 1,
    }));
  } catch {
    return [];
  }
}

/**
 * Step 2 — For each cluster, select best content and generate merged output.
 * Receives the actual chunk texts for a cluster and produces the final topic card.
 */
async function mergeCluster(
  cluster: { topic: string; subtopic: string; chunk_ids: string[]; duplicate_count: number },
  chunkTexts: string[],
  bookTitle: string,
): Promise<{
  title: string;
  subtopic: string;
  core_idea: string;
  best_insight: string;
  merged_version: string;
  duplicate_count: number;
  source_chunk_ids: string[];
}> {
  const combined = chunkTexts.map((t, i) => `--- Source ${i + 1} ---\n${t}`).join("\n\n");

  const prompt = `You are writing a section for the book "${bookTitle}".

Topic: ${cluster.topic}${cluster.subtopic ? ` > ${cluster.subtopic}` : ""}

Below are ${chunkTexts.length} source passages about this topic. ${cluster.duplicate_count > 1 ? `About ${cluster.duplicate_count} of them say similar things.` : ""}

${combined}

TASK — produce ONE definitive section by:
1. Identifying the single CORE IDEA (1-2 sentences, precise, not generic)
2. Extracting the BEST INSIGHT — the single strongest, most quotable line from the sources. Use the author's original words when possible, not a paraphrase. If the source is in Spanish, keep it in Spanish.
3. Writing a MERGED VERSION — a clean, deduplicated paragraph that:
   - combines the best material from all sources
   - eliminates repetition completely
   - preserves the author's voice and tone
   - does NOT add generic motivational filler
   - does NOT start with "In summary" or "Overall"
   - reads like a polished draft paragraph ready for a book
   - is 80-200 words

Return ONLY a JSON object:
{
  "core_idea": "...",
  "best_insight": "...",
  "merged_version": "..."
}`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const raw = response.output_text?.trim() || "{}";
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);
    return {
      title: cluster.topic,
      subtopic: cluster.subtopic,
      core_idea: String(parsed.core_idea ?? ""),
      best_insight: String(parsed.best_insight ?? ""),
      merged_version: String(parsed.merged_version ?? ""),
      duplicate_count: cluster.duplicate_count,
      source_chunk_ids: cluster.chunk_ids,
    };
  } catch {
    return {
      title: cluster.topic,
      subtopic: cluster.subtopic,
      core_idea: "",
      best_insight: "",
      merged_version: chunkTexts[0]?.slice(0, 500) ?? "",
      duplicate_count: cluster.duplicate_count,
      source_chunk_ids: cluster.chunk_ids,
    };
  }
}

/* ─── Main route ───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Support both chunk-based (new) and item-based (legacy) payloads
  const chunks: ChunkInput[] = [];

  if (body?.chunks && Array.isArray(body.chunks)) {
    for (const c of body.chunks) {
      chunks.push({
        chunk_id: c.chunk_id ?? undefined,
        item_title: String(c.item_title ?? ""),
        chunk_title: String(c.chunk_title ?? ""),
        chunk_text: String(c.chunk_text ?? ""),
      });
    }
  } else if (body?.items && Array.isArray(body.items)) {
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

  try {
    // ── Step 1: Classify chunks into topic clusters ──────────
    const clusters = await classifyAndCluster(chunks, bookTitle);

    if (clusters.length === 0) {
      return NextResponse.json({ error: "Could not identify topics from the source material." }, { status: 422 });
    }

    // ── Step 2: Build a chunk_id → text lookup ──────────────
    const chunkMap = new Map<string, string>();
    chunks.forEach((c, i) => {
      const id = c.chunk_id || `c${i}`;
      chunkMap.set(id, c.chunk_text);
    });

    // ── Step 3: Merge each cluster in parallel ──────────────
    const mergePromises = clusters.map((cluster) => {
      const texts = cluster.chunk_ids
        .map((id) => chunkMap.get(id))
        .filter((t): t is string => !!t);
      if (texts.length === 0) return null;
      // Cap each cluster to ~6000 chars total to stay within token limits
      const cappedTexts: string[] = [];
      let charCount = 0;
      for (const t of texts) {
        if (charCount + t.length > 6000) {
          cappedTexts.push(t.slice(0, Math.max(0, 6000 - charCount)));
          break;
        }
        cappedTexts.push(t);
        charCount += t.length;
      }
      return mergeCluster(cluster, cappedTexts, bookTitle);
    });

    const results = await Promise.all(mergePromises);
    const topics = results.filter((r): r is NonNullable<typeof r> => r !== null && !!r.merged_version);

    return NextResponse.json({ topics });
  } catch (err) {
    console.error("Compiled draft generation failed:", err);
    return NextResponse.json({ error: "AI compilation failed" }, { status: 500 });
  }
}
