import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  conversations,
  messages,
  type Conversation,
  type Message,
} from "@/db/schema";
import type { CitationPayload } from "@/lib/chat/protocol";

/**
 * Persistence for chat threads. Pure data access over Drizzle — no AI calls, no
 * HTTP. Mirrors the style of `src/lib/collections.ts` (imports the raw `db`
 * client so it can be used from the route, server actions, and CLI tooling).
 *
 * A conversation is scoped to one collection (corpus); see `conversations` in
 * `src/db/schema.ts` for why. Retrieval scoping is derived from
 * `conversation.collectionId`, never from the client.
 */

/** A conversation together with its messages in authored order. */
export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

/** Create a new, empty thread bound to a collection. */
export async function createConversation(input: {
  collectionId: string;
  title: string;
}): Promise<Conversation> {
  const [row] = await db
    .insert(conversations)
    .values({ collectionId: input.collectionId, title: input.title })
    .returning();
  return row;
}

/**
 * A collection's conversations, most-recently-active first. Ordered by
 * `updatedAt` (bumped on every appended message) so the sidebar shows live
 * threads at the top.
 */
export async function listConversations(
  collectionId: string,
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.collectionId, collectionId))
    .orderBy(desc(conversations.updatedAt));
}

/**
 * Load one conversation with all of its messages (authored order). Returns
 * `null` if the id doesn't exist — used to detect stale ids on reload.
 */
export async function getConversation(
  id: string,
): Promise<ConversationWithMessages | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conversation) return null;

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  return { conversation, messages: rows };
}

/**
 * Append a message to a thread and bump the thread's `updatedAt`, atomically.
 * `citations` is only meaningful for assistant messages; pass `null`/omit for
 * user messages and unanswerable answers.
 */
export async function appendMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationPayload[] | null;
}): Promise<Message> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        citations: input.citations ?? null,
      })
      .returning();

    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));

    return row;
  });
}

/**
 * Rename a conversation (e.g. once the auto-generated title is ready). Scoped to
 * a no-op if the id doesn't exist.
 */
export async function renameConversation(
  id: string,
  title: string,
): Promise<void> {
  await db.update(conversations).set({ title }).where(eq(conversations.id, id));
}

/** Delete a conversation and (via cascade) all of its messages. */
export async function deleteConversation(id: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, id));
}

/**
 * The most recent turns of a thread, oldest-first, capped at `limit` messages.
 * Used to build both the query-rewrite input and the generation context window.
 */
export function recentTurns(
  msgs: Message[],
  limit: number,
): { role: "user" | "assistant"; content: string }[] {
  return msgs
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Verify a conversation belongs to the given collection. Guards against a client
 * sending a conversation id that doesn't match its selected corpus.
 */
export async function conversationBelongsTo(
  conversationId: string,
  collectionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.collectionId, collectionId),
      ),
    )
    .limit(1);
  return row !== undefined;
}
