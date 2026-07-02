import { getAIProvider } from "@/lib/ai";
import { search, type SearchHit, type SearchOptions } from "@/lib/retrieval/search";
import { condenseQuestion, type ConversationTurn } from "@/lib/generation/rewrite";

/**
 * A resolved citation: a context passage the model said it used, paired with
 * the source metadata the UI needs to link back to the original document.
 */
export interface Citation {
  /** The [n] marker shown to the model in the prompt. */
  marker: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentFilename: string;
  chunkIndex: number;
  page: number | null;
  similarity: number;
  /**
   * The verbatim span from this chunk that supports the answer — the "relevant
   * passage". Copied by the model from the context; may be "" if the model gave
   * none, in which case the UI falls back to highlighting the whole chunk.
   */
  quote: string;
}

export interface RagAnswer {
  question: string;
  /** The model's answer text. */
  answer: string;
  /** False when the context didn't contain the answer (honest "I don't know"). */
  answerable: boolean;
  /** Chunks the model cited, resolved to their sources. Empty if unanswerable. */
  citations: Citation[];
  /** Everything retrieved, for transparency/debugging (not just what was cited). */
  retrieved: SearchHit[];
  /** The standalone query actually sent to retrieval (post query-rewrite). Equal
   * to `question` on the first turn or when no rewrite happened. */
  retrievalQuery: string;
}

export interface AnswerOptions extends SearchOptions {
  /**
   * Recent prior turns (oldest-first), for multi-turn support. Used two ways:
   *  1. To rewrite a follow-up into a standalone retrieval query (see rewrite.ts).
   *  2. As conversation context in the generation prompt, so the model can
   *     resolve references — while still answering ONLY from retrieved CONTEXT.
   * Omit/empty for a stateless, single-shot question (today's behavior).
   */
  history?: ConversationTurn[];
}

/**
 * ============================================================================
 * Grounding strategy — how we keep the model inside the context
 * ============================================================================
 * 1. The system prompt assigns a narrow role: answer ONLY from the supplied
 *    passages, never from prior/world knowledge.
 * 2. We feed it ONLY the retrieved chunks — nothing else is in the prompt.
 * 3. We force a JSON response with an explicit `answerable` boolean. Making the
 *    model commit to "is this answerable from the context?" as structured data
 *    discourages the slide into a plausible-but-ungrounded answer, and gives us
 *    a clean signal to act on.
 * 4. Citations are required: for each passage used, the model returns its [n]
 *    marker AND a verbatim quote — the exact span that supports the answer. We
 *    resolve the marker back to a real chunk id on our side (so a citation can
 *    only point at a chunk we retrieved), and the quote lets the UI highlight
 *    just the relevant passage, not the whole chunk. If unanswerable,
 *    `citations` must be empty (enforced below too).
 * 5. temperature 0 — deterministic, minimal creative drift.
 * ============================================================================
 */
const SYSTEM_PROMPT = `You are a precise question-answering assistant in a multi-turn chat. You answer questions using ONLY the CONTEXT passages provided by the user, which were retrieved from their documents.

A CONVERSATION SO FAR section may precede the CONTEXT. Use it ONLY to understand what the current QUESTION refers to (pronouns, follow-ups like "what about that?"). It is NOT a source: never treat earlier messages as facts to answer from, and never cite them. Every fact in your answer must come from the CONTEXT passages below.

Rules:
1. Use ONLY information found in the CONTEXT. Never use outside or prior knowledge, the conversation history, and never guess.
2. If the CONTEXT does not contain enough information to answer the question, set "answerable" to false and, in "answer", state plainly that the answer is not in the provided documents. Do not attempt a partial or speculative answer.
3. When you do answer, every statement must be supported by the CONTEXT. For each passage you used, add an entry to "citations" with its numeric [n] marker as "source" and, in "quote", the SHORTEST verbatim span (copied EXACTLY, character-for-character, from that passage) that supports your answer. Do not paraphrase the quote; do not include the "[n]" marker or the "(source: …)" label in it.
4. If "answerable" is false, "citations" MUST be an empty array.
5. Respond with a SINGLE JSON object and nothing else, exactly in this shape:
{"answer": string, "answerable": boolean, "citations": [{"source": number, "quote": string}]}`;

const DEFAULT_TOP_K = 5;

/** Shape we expect back from the model (before we validate it). */
interface ModelResponse {
  answer?: unknown;
  answerable?: unknown;
  citations?: unknown;
}

/**
 * Answers a question grounded in retrieved chunks, with structured citations.
 */
export async function answerQuestion(
  question: string,
  options: AnswerOptions = {},
): Promise<RagAnswer> {
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    throw new Error("Question is empty.");
  }

  const topK = options.topK ?? DEFAULT_TOP_K;
  const history = options.history ?? [];
  const ai = getAIProvider();

  // Follow-up → standalone query for retrieval only (see rewrite.ts). The visible
  // question and generation prompt keep the user's original wording.
  const retrievalQuery = await condenseQuestion(trimmed, history, ai);
  const retrieved = await search(retrievalQuery, { ...options, topK });

  // No context at all → don't even call the model; we can't ground an answer.
  if (retrieved.length === 0) {
    return {
      question: trimmed,
      answer:
        "I couldn't find anything relevant in the documents to answer that.",
      answerable: false,
      citations: [],
      retrieved,
      retrievalQuery,
    };
  }

  // Build the numbered context block. [n] markers are 1-based and map to
  // `retrieved[n - 1]` when we resolve citations afterward.
  const contextBlock = retrieved
    .map((hit, i) => {
      const loc =
        `${hit.documentFilename}, chunk ${hit.chunkIndex}` +
        (hit.page != null ? `, page ${hit.page}` : "");
      return `[${i + 1}] (source: ${loc})\n${hit.content}`;
    })
    .join("\n\n");

  // Prepend recent turns so the model can resolve references. Framed as context
  // only — the system prompt forbids using it as a source or citing it.
  const historyBlock =
    history.length > 0
      ? "CONVERSATION SO FAR:\n" +
        history
          .map(
            (t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`,
          )
          .join("\n") +
        "\n\n"
      : "";

  const userPrompt = `${historyBlock}CONTEXT:\n${contextBlock}\n\nQUESTION: ${trimmed}`;

  const raw = await ai.llm.generate(userPrompt, {
    system: SYSTEM_PROMPT,
    temperature: 0,
    json: true,
  });

  const parsed = safeParse(raw);

  // Default to a safe, non-answer if the model returned something unexpected.
  const answerable = parsed?.answerable === true;
  const answerText =
    typeof parsed?.answer === "string" && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : "I couldn't produce a grounded answer from the documents.";

  // Resolve cited markers → real chunks, carrying the model's quote. Keep only
  // valid in-range markers (de-duped), and only when the model is answering.
  const citations: Citation[] = answerable
    ? dedupeByMarker(parseCitations(parsed?.citations))
        .filter((c) => c.marker >= 1 && c.marker <= retrieved.length)
        .map(({ marker, quote }) => {
          const hit = retrieved[marker - 1];
          return {
            marker,
            chunkId: hit.chunkId,
            documentId: hit.documentId,
            documentTitle: hit.documentTitle,
            documentFilename: hit.documentFilename,
            chunkIndex: hit.chunkIndex,
            page: hit.page,
            similarity: hit.similarity,
            quote,
          };
        })
    : [];

  return {
    question: trimmed,
    answer: answerText,
    answerable,
    citations,
    retrieved,
    retrievalQuery,
  };
}

function safeParse(text: string): ModelResponse | null {
  try {
    return JSON.parse(text) as ModelResponse;
  } catch {
    // JSON mode should prevent this, but stay defensive: try to salvage the
    // first {...} block if the model wrapped it in stray text.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ModelResponse;
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface ParsedCitation {
  marker: number;
  quote: string;
}

/** Normalize the model's `citations` array into validated {marker, quote}. */
function parseCitations(value: unknown): ParsedCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): ParsedCitation | null => {
      if (typeof entry !== "object" || entry === null) return null;
      const source = Number((entry as { source?: unknown }).source);
      const quote = (entry as { quote?: unknown }).quote;
      if (!Number.isInteger(source)) return null;
      return { marker: source, quote: typeof quote === "string" ? quote : "" };
    })
    .filter((c): c is ParsedCitation => c !== null);
}

/** Keep the first citation per marker (one card per chunk). */
function dedupeByMarker(citations: ParsedCitation[]): ParsedCitation[] {
  const seen = new Set<number>();
  return citations.filter((c) => {
    if (seen.has(c.marker)) return false;
    seen.add(c.marker);
    return true;
  });
}
