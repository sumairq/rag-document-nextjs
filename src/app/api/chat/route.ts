import { answerQuestion } from "@/lib/generation/answer";
import { generateTitle } from "@/lib/generation/title";
import { classifyError } from "@/lib/errors";
import {
  appendMessage,
  createConversation,
  getConversation,
  recentTurns,
} from "@/lib/conversations";
import type { Conversation } from "@/db/schema";
import type { ConversationTurn } from "@/lib/generation/rewrite";
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
// How many recent messages to feed the query-rewrite and generation context.
// 8 messages ≈ 4 exchanges — enough to resolve most follow-ups without bloating
// the prompt or letting stale turns dominate.
const HISTORY_WINDOW = 8;
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

  const conversationId =
    typeof (body as { conversationId?: unknown })?.conversationId === "string"
      ? (body as { conversationId: string }).conversationId
      : undefined;

  // --- Resolve conversation context ---
  // If a conversation id is given, load it for history and to derive the corpus
  // scope. A stale/unknown id (e.g. the thread was deleted) is treated as "start
  // a new thread" rather than an error, so the client never dead-ends.
  let conversation: Conversation | null = null;
  let history: ConversationTurn[] = [];
  if (conversationId) {
    const existing = await getConversation(conversationId);
    if (existing) {
      conversation = existing.conversation;
      history = recentTurns(existing.messages, HISTORY_WINDOW);
    }
  }

  // Retrieval scope is the conversation's own corpus when continuing a thread
  // (the source of truth), else the collection the client selected for a new one.
  const scopeCollectionId = conversation?.collectionId ?? collectionId;
  if (!scopeCollectionId) {
    return jsonError("Select a collection before chatting.", 400);
  }

  // --- Generate (retrieval + grounded generation) + title, up front ---
  // Done before streaming so engine errors become a clean HTTP status rather
  // than a half-streamed response. For a new thread we generate the title in
  // parallel with the answer to hide its latency.
  let result;
  let title: string;
  try {
    const [answer, resolvedTitle] = await Promise.all([
      answerQuestion(question, { collectionId: scopeCollectionId, history }),
      conversation
        ? Promise.resolve(conversation.title)
        : generateTitle(question),
    ]);
    result = answer;
    title = resolvedTitle;
  } catch (err) {
    console.error("[/api/chat] generation failed:", err);
    const { status, message } = classifyError(err, "chat");
    return jsonError(message, status);
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

  // --- Persist the turn (create thread on first message) ---
  // Both messages are saved before streaming, so a reload always restores a
  // complete turn (and the assistant's citations re-hydrate from JSONB).
  try {
    if (!conversation) {
      conversation = await createConversation({
        collectionId: scopeCollectionId,
        title,
      });
    }
    await appendMessage({
      conversationId: conversation.id,
      role: "user",
      content: question,
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: result.answer,
      // Only answers with sources carry citations; keep NULL otherwise.
      citations: citations.length > 0 ? citations : null,
    });
  } catch (err) {
    console.error("[/api/chat] persistence failed:", err);
    return jsonError("Couldn't save the conversation. Please try again.", 500);
  }

  const savedConversation = conversation;

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
          conversationId: savedConversation.id,
          title: savedConversation.title,
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
