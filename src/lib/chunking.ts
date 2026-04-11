/**
 * Chunking service for Library documents.
 *
 * Reusable by: Library ingest, Library analysis, Compiled Draft generation,
 * and any future search/retrieval features.
 */

/* ─── Types ────────────────────────────────────────────────── */

export type LibraryChunk = {
  chunk_id: string;
  chunk_index: number;
  chunk_title: string;
  chunk_text: string;
  word_count: number;
  heading_level: number | null;
  char_start: number;
  char_end: number;
};

/* ─── Constants ────────────────────────────────────────────── */

const CHUNK_MIN = 300;
const CHUNK_MAX = 800;

/* ─── Helpers ──────────────────────────────────────────────── */

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Detect whether a line looks like a heading.
 * Returns a heading level (1-3) or 0 if not a heading.
 */
export function detectHeadingLevel(line: string): number {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120 || trimmed.length < 3) return 0;

  // Chapter / Part / Section prefixes → level 1
  if (/^(chapter|part)\s/i.test(trimmed)) return 1;
  if (/^section\s/i.test(trimmed)) return 2;

  // Numbered headings: "1. Title", "1) Title", "1- Title"
  if (/^\d{1,3}[\.\)\-:]\s/.test(trimmed)) return 2;

  // ALL CAPS short lines → level 1
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed)) return 1;

  // Title case: most words capitalized, short line → level 2
  const words = trimmed.split(/\s+/);
  if (words.length >= 1 && words.length <= 8) {
    const capWords = words.filter((w) => /^[A-Z\d]/.test(w));
    if (capWords.length >= words.length * 0.6) return 2;
  }

  return 0;
}

/* ─── Main chunking function ───────────────────────────────── */

/**
 * Split extracted text into ordered chunks.
 *
 * Strategy:
 * 1. Heading-aware splitting (using detectHeadingLevel)
 * 2. Merge small sections / split large ones to stay within CHUNK_MIN–CHUNK_MAX
 * 3. Fallback to paragraph + word-count splitting if no headings found
 */
export function chunkText(fullText: string): LibraryChunk[] {
  if (!fullText.trim()) return [];

  const lines = fullText.split(/\n/);

  // ── Phase 1: Build raw sections by heading detection ──────
  type RawSection = { title: string | null; headingLevel: number; lines: string[]; startOffset: number };
  const sections: RawSection[] = [];
  let current: RawSection = { title: null, headingLevel: 0, lines: [], startOffset: 0 };
  let charOffset = 0;

  for (const line of lines) {
    const hl = detectHeadingLevel(line);
    if (hl > 0 && current.lines.some((l) => l.trim())) {
      sections.push(current);
      current = { title: line.trim(), headingLevel: hl, lines: [], startOffset: charOffset };
    } else {
      current.lines.push(line);
    }
    charOffset += line.length + 1; // +1 for \n
  }
  sections.push(current);

  // ── Phase 2: Merge / split into chunks ────────────────────
  const chunks: LibraryChunk[] = [];
  let pendingTitle: string | null = null;
  let pendingHeadingLevel: number | null = null;
  let pendingText = "";
  let pendingStart = 0;
  let chunkIdx = 0;

  function flushChunk(title: string | null, headingLevel: number | null, text: string, startPos: number) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const wc = countWords(trimmed);
    const charStart = fullText.indexOf(trimmed, Math.max(0, startPos - 50));
    chunks.push({
      chunk_id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `chunk-${chunkIdx}-${Date.now()}`,
      chunk_index: chunkIdx,
      chunk_title: title || `Chunk ${chunkIdx + 1}`,
      chunk_text: trimmed,
      word_count: wc,
      heading_level: headingLevel ?? null,
      char_start: charStart >= 0 ? charStart : 0,
      char_end: (charStart >= 0 ? charStart : 0) + trimmed.length,
    });
    chunkIdx++;
  }

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText && !section.title) continue;

    const combinedWc = countWords(pendingText + " " + sectionText);

    if (combinedWc <= CHUNK_MAX) {
      // Accumulate
      if (!pendingTitle && section.title) {
        pendingTitle = section.title;
        pendingHeadingLevel = section.headingLevel;
      }
      if (!pendingText) pendingStart = section.startOffset;
      pendingText = pendingText ? pendingText + "\n\n" + sectionText : sectionText;
    } else {
      // Flush pending if substantial
      if (countWords(pendingText) >= CHUNK_MIN) {
        flushChunk(pendingTitle, pendingHeadingLevel, pendingText, pendingStart);
        pendingTitle = section.title || null;
        pendingHeadingLevel = section.headingLevel || null;
        pendingText = sectionText;
        pendingStart = section.startOffset;
      } else if (pendingText) {
        // Pending too small, merge then split if needed
        pendingText = pendingText + "\n\n" + sectionText;
        if (!pendingTitle && section.title) {
          pendingTitle = section.title;
          pendingHeadingLevel = section.headingLevel;
        }
        if (countWords(pendingText) > CHUNK_MAX) {
          const paragraphs = pendingText.split(/\n\n+/);
          let buf = "";
          for (const para of paragraphs) {
            if (countWords(buf + " " + para) > CHUNK_MAX && countWords(buf) >= CHUNK_MIN) {
              flushChunk(pendingTitle, pendingHeadingLevel, buf, pendingStart);
              pendingTitle = null;
              pendingHeadingLevel = null;
              buf = para;
            } else {
              buf = buf ? buf + "\n\n" + para : para;
            }
          }
          pendingText = buf;
        }
      } else {
        pendingTitle = section.title || null;
        pendingHeadingLevel = section.headingLevel || null;
        pendingText = sectionText;
        pendingStart = section.startOffset;
      }
    }
  }
  // Flush remaining
  if (pendingText.trim()) {
    flushChunk(pendingTitle, pendingHeadingLevel, pendingText, pendingStart);
  }

  // If nothing was produced, create a single chunk
  if (chunks.length === 0 && fullText.trim()) {
    chunks.push({
      chunk_id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `chunk-0-${Date.now()}`,
      chunk_index: 0,
      chunk_title: "Full Document",
      chunk_text: fullText.trim(),
      word_count: countWords(fullText),
      heading_level: null,
      char_start: 0,
      char_end: fullText.trim().length,
    });
  }

  return chunks;
}

/* ─── Library Item helpers ─────────────────────────────────── */

export type AnalysisStatus = "not_analyzed" | "chunked" | "analyzed" | "error";

/**
 * Ensure a library item has chunks. If chunks are missing (backward compat),
 * generate them from extracted_text / content.
 */
export function ensureChunks(
  content: string,
  existingChunks: LibraryChunk[] | undefined | null,
): LibraryChunk[] {
  if (existingChunks && existingChunks.length > 0) return existingChunks;
  return chunkText(content);
}

/**
 * Collect all chunk texts from selected library items, ordered by item then chunk index.
 * Used by Compiled Draft generation.
 */
export function gatherChunksFromItems(
  items: { title: string; content: string; chunks?: LibraryChunk[] }[],
): { chunk_id: string; item_title: string; chunk_title: string; chunk_text: string; word_count: number }[] {
  const result: { chunk_id: string; item_title: string; chunk_title: string; chunk_text: string; word_count: number }[] = [];
  for (const item of items) {
    const chunks = ensureChunks(item.content, item.chunks);
    for (const c of chunks) {
      result.push({
        chunk_id: c.chunk_id,
        item_title: item.title,
        chunk_title: c.chunk_title,
        chunk_text: c.chunk_text,
        word_count: c.word_count,
      });
    }
  }
  return result;
}
