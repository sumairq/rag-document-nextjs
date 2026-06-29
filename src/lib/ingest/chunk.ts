import type { ParsedPage } from "./parsers/types";

/**
 * ============================================================================
 * Chunking strategy — why these numbers
 * ============================================================================
 *
 * Retrieval works on *chunks*, not whole documents: we embed each chunk, then
 * at query time fetch the few chunks closest to the question. So chunk size is
 * really a tuning knob for retrieval quality, and it's a trade-off:
 *
 *   - TOO BIG (e.g. whole pages / 4k+ tokens): each chunk mixes several topics,
 *     so its single embedding is an average that matches nothing sharply
 *     ("semantic dilution"). Retrieval gets less precise, and you waste the
 *     LLM's context window stuffing in mostly-irrelevant text — which also
 *     raises cost and can bury the relevant sentence ("lost in the middle").
 *
 *   - TOO SMALL (e.g. one sentence / <100 tokens): each chunk loses the context
 *     that makes it interpretable. A pronoun or a figure ("it rose 12%") has no
 *     anchor, embeddings become noisy, and a complete answer ends up split
 *     across many tiny chunks, so top-k retrieval misses part of it.
 *
 * ~800 tokens is a good middle ground for prose: roughly several paragraphs —
 * one coherent idea — while staying small enough to be a precise retrieval unit
 * and to pack several chunks into the model's context.
 *
 * OVERLAP (~150 tokens) repeats the tail of one chunk at the head of the next.
 * Fixed-size splitting cuts blindly and will sometimes slice a sentence — or
 * the one fact that answers a question — across a boundary. Overlap means that
 * straddling content still appears whole in at least one chunk, so retrieval
 * can find it. The cost is some duplicated text (more rows, more embedding
 * calls), which is why overlap is a fraction of chunk size, not half of it.
 *
 * NOTE ON TOKENS: true token counts depend on the model's tokenizer. For
 * sizing we use a cheap, well-known heuristic (~4 characters per token for
 * English) so chunking stays dependency-free and deterministic, and we window
 * over characters — which also gives us exact char offsets for citations. The
 * stored `tokenCount` is therefore an estimate; swap in a real tokenizer later
 * if you need exact budgets.
 * ============================================================================
 */

/** Heuristic: average English characters per token. */
export const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  /** Target chunk size in (estimated) tokens. */
  targetTokens?: number;
  /** Overlap between consecutive chunks in (estimated) tokens. */
  overlapTokens?: number;
}

const DEFAULT_TARGET_TOKENS = 800;
const DEFAULT_OVERLAP_TOKENS = 150;

/** A chunk's text plus everything needed to locate and order it later. */
export interface TextChunk {
  /** 0-based position within the document. */
  index: number;
  content: string;
  /** Char offset (inclusive) in the original parsed text. */
  charStart: number;
  /** Char offset (exclusive) in the original parsed text. */
  charEnd: number;
  /** Estimated token count of `content`. */
  tokenCount: number;
  /** 1-based source page, if the format had pages. Null otherwise. */
  page: number | null;
}

/**
 * Splits text into fixed-size, overlapping chunks. Boundaries are snapped back
 * to the nearest whitespace (within a small look-back window) so we don't cut
 * mid-word; char offsets always reflect the actual span used.
 */
export function chunkText(
  text: string,
  pages?: ParsedPage[],
  options: ChunkOptions = {},
): TextChunk[] {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  const chunkSize = targetTokens * CHARS_PER_TOKEN;
  const overlap = overlapTokens * CHARS_PER_TOKEN;
  // How far back we'll scan to land on whitespace rather than mid-word.
  const snapWindow = Math.min(64, Math.floor(chunkSize * 0.1));

  const trimmed = text.trimEnd();
  const chunks: TextChunk[] = [];
  if (trimmed.trim().length === 0) return chunks;

  let start = 0;
  let index = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + chunkSize, trimmed.length);

    // Snap `end` back to whitespace unless we're at the very end of the text.
    if (end < trimmed.length) {
      const slice = trimmed.slice(end - snapWindow, end);
      const lastSpace = slice.search(/\s\S*$/);
      if (lastSpace !== -1) {
        const candidate = end - snapWindow + lastSpace;
        if (candidate > start) end = candidate;
      }
    }

    const content = trimmed.slice(start, end).trim();
    if (content.length > 0) {
      // Recompute exact offsets after trimming leading/trailing whitespace.
      const leading = trimmed.slice(start, end).length - trimmed.slice(start, end).trimStart().length;
      const charStart = start + leading;
      const charEnd = charStart + content.length;
      chunks.push({
        index: index++,
        content,
        charStart,
        charEnd,
        tokenCount: Math.max(1, Math.round(content.length / CHARS_PER_TOKEN)),
        page: pageForOffset(charStart, pages),
      });
    }

    if (end >= trimmed.length) break;
    // Advance, keeping `overlap` chars of context; always make forward progress.
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

/** Finds the 1-based page containing a char offset via binary search. */
function pageForOffset(
  offset: number,
  pages?: ParsedPage[],
): number | null {
  if (!pages || pages.length === 0) return null;
  let lo = 0;
  let hi = pages.length - 1;
  let best = pages[0].pageNumber;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const page = pages[mid];
    if (offset < page.charStart) {
      hi = mid - 1;
    } else {
      best = page.pageNumber;
      if (offset < page.charEnd) return page.pageNumber;
      lo = mid + 1;
    }
  }
  // Offset fell in a separator gap; attribute to the preceding page.
  return best;
}
