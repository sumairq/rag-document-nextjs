"use server";

import {
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationWithMessages,
} from "@/lib/conversations";
import type {
  ConversationDetail,
  ConversationSummary,
} from "@/lib/chat/protocol";
import type { Conversation } from "@/db/schema";

/**
 * Client-callable Server Actions for conversation persistence.
 *
 * These wrap the pure data layer in `@/lib/conversations` and are the only part
 * of it a Client Component may import (importing the lib directly would pull the
 * DB client into the browser bundle). They return plain, serializable shapes
 * (dates as ISO strings) matching the wire types in `@/lib/chat/protocol`.
 *
 * Sending a message is NOT here: it goes through the streaming `/api/chat` route
 * so persistence stays atomic with generation. These actions cover the
 * read/manage side the sidebar will use next: list, restore, delete.
 */

function toSummary(c: Conversation): ConversationSummary {
  return {
    id: c.id,
    collectionId: c.collectionId,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toDetail(data: ConversationWithMessages): ConversationDetail {
  return {
    conversation: toSummary(data.conversation),
    messages: data.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: m.citations ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** All conversations for a collection, most-recently-active first. */
export async function listConversationsAction(
  collectionId: string,
): Promise<ConversationSummary[]> {
  if (!collectionId) return [];
  const rows = await listConversations(collectionId);
  return rows.map(toSummary);
}

/** A conversation with its messages, or `null` if the id is unknown/stale. */
export async function getConversationAction(
  id: string,
): Promise<ConversationDetail | null> {
  if (!id) return null;
  const data = await getConversation(id);
  return data ? toDetail(data) : null;
}

/** Delete a conversation and all of its messages. */
export async function deleteConversationAction(id: string): Promise<void> {
  if (!id) return;
  await deleteConversation(id);
}
