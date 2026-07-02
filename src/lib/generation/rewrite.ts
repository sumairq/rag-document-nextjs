import type { AIProvider } from "@/lib/ai";

/** A prior turn used as context for rewriting/answering. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * ============================================================================
 * Query rewrite (a.k.a. "condense") — why this step exists
 * ============================================================================
 * Retrieval embeds the user's message and matches it against chunk vectors. A
 * follow-up like "what about that?" or "and the second one?" embeds to
 * something meaningless on its own — the referent lives in earlier turns, which
 * retrieval never sees. So before retrieving we rewrite the latest message into
 * a STANDALONE question using the recent history.
 *
 * Two rules keep this safe:
 *  - If the message is already self-contained, it's returned essentially
 *    unchanged (the model is told to do so).
 *  - The rewrite feeds RETRIEVAL ONLY. Generation still receives the user's
 *    original wording plus the history, so the answer reads naturally and we
 *    never "put words in the user's mouth" in the visible transcript.
 *
 * The model may only paraphrase using terms grounded in the conversation; it is
 * explicitly forbidden from inventing new topics or answering the question.
 * On any failure (or empty output) we fall back to the original message, so a
 * flaky rewrite degrades to today's stateless behavior rather than breaking.
 * ============================================================================
 */
const REWRITE_SYSTEM = `You rewrite a user's latest message into a standalone search query for a document retrieval system.

Rules:
1. Resolve pronouns and references ("it", "that", "the second one", "those") into explicit terms using ONLY the conversation provided.
2. If the latest message is already self-contained, return it unchanged.
3. Preserve the user's intent and terminology. Do NOT invent topics, entities, or constraints that are not in the conversation or the message.
4. Do NOT answer the question. Output ONLY the rewritten query as a single line, with no quotes, labels, or preamble.`;

/** Cap on how much prior text we feed the rewrite model. */
const MAX_REWRITE_TOKENS = 256;

/**
 * Rewrite `question` into a standalone retrieval query using `history`.
 *
 * Returns the original question untouched when there's no history (first turn),
 * or when the model errors/returns nothing.
 */
export async function condenseQuestion(
  question: string,
  history: ConversationTurn[],
  ai: AIProvider,
): Promise<string> {
  if (history.length === 0) return question;

  const transcript = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  const prompt = `CONVERSATION:\n${transcript}\n\nLATEST USER MESSAGE: ${question}\n\nRewritten standalone query:`;

  try {
    const raw = await ai.llm.generate(prompt, {
      system: REWRITE_SYSTEM,
      temperature: 0,
      maxOutputTokens: MAX_REWRITE_TOKENS,
    });
    const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
    return cleaned.length > 0 ? cleaned : question;
  } catch (err) {
    // A failed rewrite must not fail the turn — fall back to the raw question.
    console.error("[rewrite] condense failed, using original question:", err);
    return question;
  }
}
