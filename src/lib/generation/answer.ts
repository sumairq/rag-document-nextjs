import { getAIProvider } from "@/lib/ai";
import { search, type SearchHit, type SearchOptions } from "@/lib/retrieval/search";

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
}

export type AnswerOptions = SearchOptions;

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
 * 4. Citations are required: the model must list the [n] markers it used. We
 *    then resolve those markers back to real chunk ids on our side — so a
 *    citation can only ever point at a chunk we actually retrieved. If the
 *    model is not answering, `sources` must be empty (enforced below too).
 * 5. temperature 0 — deterministic, minimal creative drift.
 * ============================================================================
 */
const SYSTEM_PROMPT = `You are a precise question-answering assistant. You answer questions using ONLY the CONTEXT passages provided by the user, which were retrieved from their documents.

Rules:
1. Use ONLY information found in the CONTEXT. Never use outside or prior knowledge, and never guess.
2. If the CONTEXT does not contain enough information to answer the question, set "answerable" to false and, in "answer", state plainly that the answer is not in the provided documents. Do not attempt a partial or speculative answer.
3. When you do answer, every statement must be supported by the CONTEXT. In "sources", list the numeric [n] markers of the passages you actually used.
4. If "answerable" is false, "sources" MUST be an empty array.
5. Respond with a SINGLE JSON object and nothing else, exactly in this shape:
{"answer": string, "answerable": boolean, "sources": number[]}`;

const DEFAULT_TOP_K = 5;

/** Shape we expect back from the model (before we validate it). */
interface ModelResponse {
  answer?: unknown;
  answerable?: unknown;
  sources?: unknown;
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
  const retrieved = await search(trimmed, { ...options, topK });

  // No context at all → don't even call the model; we can't ground an answer.
  if (retrieved.length === 0) {
    return {
      question: trimmed,
      answer:
        "I couldn't find anything relevant in the documents to answer that.",
      answerable: false,
      citations: [],
      retrieved,
    };
  }

  const ai = getAIProvider();

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

  const userPrompt = `CONTEXT:\n${contextBlock}\n\nQUESTION: ${trimmed}`;

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

  // Resolve cited markers → real chunks. Only keep valid, in-range markers,
  // and only when the model claims the question is answerable.
  const citations: Citation[] = answerable
    ? toMarkerList(parsed?.sources)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= retrieved.length)
        .filter((n, i, arr) => arr.indexOf(n) === i) // de-dupe
        .map((marker) => {
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
          };
        })
    : [];

  return {
    question: trimmed,
    answer: answerText,
    answerable,
    citations,
    retrieved,
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

function toMarkerList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => Number(v));
}
