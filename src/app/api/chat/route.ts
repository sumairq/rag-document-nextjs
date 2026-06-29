import { answerQuestion } from "@/lib/generation/answer";
import {
  NDJSON_CONTENT_TYPE,
  type ChatStreamEvent,
  type CitationPayload,
} from "@/lib/chat/protocol";

// postgres.js + the AI SDK need the Node.js runtime (not Edge). And the
// response must never be cached — it's a live stream per request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNIPPET_LENGTH = 200;
// Small delay between tokens so the streaming is visible in the UI. The answer
// is computed up front (the engine isn't a streaming function); this paces the
// transport so the client renders it token-by-token. Set to 0 to disable.
const TOKEN_DELAY_MS = 12;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function snippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_LENGTH
    ? `${collapsed.slice(0, SNIPPET_LENGTH)}…`
    : collapsed;
}

/** Split into word-ish tokens that preserve whitespace, so concatenating the
 * streamed pieces reproduces the answer exactly. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request): Promise<Response> {
  // --- Parse & validate input ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const question =
    typeof (body as { question?: unknown })?.question === "string"
      ? (body as { question: string }).question.trim()
      : "";
  if (!question) {
    return jsonError("A non-empty question is required.", 400);
  }

  const collectionId =
    typeof (body as { collectionId?: unknown })?.collectionId === "string"
      ? (body as { collectionId: string }).collectionId
      : undefined;

  // --- Run the engine as-is (retrieval + grounded generation) ---
  // Done before streaming so engine errors become a clean HTTP error status
  // rather than a half-streamed response.
  let result;
  try {
    result = await answerQuestion(question, { collectionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    return jsonError(message, 500);
  }

  const citations: CitationPayload[] = result.citations.map((c) => ({
    marker: c.marker,
    documentId: c.documentId,
    documentTitle: c.documentTitle,
    documentFilename: c.documentFilename,
    chunkId: c.chunkId,
    chunkIndex: c.chunkIndex,
    page: c.page,
    similarity: c.similarity,
    // Prefer the model's quote as the preview (the relevant passage); fall back
    // to the chunk's opening text if no quote was returned.
    snippet: snippet(c.quote || result.retrieved[c.marker - 1]?.content || ""),
    quote: c.quote,
  }));

  // --- Stream the answer text token-by-token, then the citations ---
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        for (const token of tokenize(result.answer)) {
          send({ type: "token", value: token });
          if (TOKEN_DELAY_MS > 0) await sleep(TOKEN_DELAY_MS);
        }
        send({
          type: "done",
          answerable: result.answerable,
          citations,
        });
      } catch {
        send({ type: "error", message: "Streaming failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering so tokens flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
