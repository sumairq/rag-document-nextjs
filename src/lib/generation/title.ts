import { getAIProvider } from "@/lib/ai";

/**
 * Auto-generate a short conversation title from the first user message
 * (ChatGPT/Claude style). Self-contained: builds its own provider so the caller
 * can fire it in parallel with answer generation.
 *
 * Robustness: the model is asked for a bare 3–6 word label, then we sanitize and
 * length-cap it. On any failure we fall back to a trimmed slice of the message,
 * so a conversation always gets a usable title.
 */
const TITLE_SYSTEM = `You generate a short, specific title for a conversation based on the user's first message.

Rules:
1. 3 to 6 words. No trailing punctuation. Title Case.
2. Capture the topic, not the phrasing ("Refund Policy Window", not "What is the refund policy?").
3. Output ONLY the title — no quotes, labels, or explanation.`;

const MAX_TITLE_CHARS = 60;

/** Trim/clean a raw title candidate to a safe single-line label. */
function sanitizeTitle(raw: string): string {
  const oneLine = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'#\-\s]+|["'\s]+$/g, "") // strip wrapping quotes/markdown/space
    .replace(/[.!?,;:]+$/, ""); // strip trailing punctuation
  return oneLine.slice(0, MAX_TITLE_CHARS).trim();
}

/** Fallback title: the first message itself, cleaned and truncated. */
function fallbackTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= MAX_TITLE_CHARS) return cleaned || "New conversation";
  return `${cleaned.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}

export async function generateTitle(firstMessage: string): Promise<string> {
  const fallback = fallbackTitle(firstMessage);
  try {
    const ai = getAIProvider();
    const raw = await ai.llm.generate(`First message: ${firstMessage}`, {
      system: TITLE_SYSTEM,
      temperature: 0,
      maxOutputTokens: 20,
    });
    const title = sanitizeTitle(raw);
    return title.length > 0 ? title : fallback;
  } catch (err) {
    console.error("[title] generation failed, using fallback:", err);
    return fallback;
  }
}
