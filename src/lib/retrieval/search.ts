import { cosineDistance, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { chunks, documents } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";

export interface SearchOptions {
  /** Number of chunks to return. */
  topK?: number;
  /** Restrict the search to a single document. */
  documentId?: string;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentFilename: string;
  chunkIndex: number;
  page: number | null;
  charStart: number | null;
  charEnd: number | null;
  content: string;
  /** Cosine similarity in [-1, 1]; 1 = identical direction. Higher is better. */
  similarity: number;
}

const DEFAULT_TOP_K = 5;

/**
 * Embeds `query` with the same provider used for ingestion (with the "query"
 * task hint) and returns the most similar chunks by cosine similarity.
 *
 * The ranking is done in Postgres via pgvector's `<=>` cosine-distance operator
 * (exposed by Drizzle's `cosineDistance`). We order by distance ascending —
 * the form pgvector's HNSW index can accelerate — and report similarity as
 * `1 - distance` for readability.
 */
export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("Query is empty.");
  }

  const ai = getAIProvider();
  const [queryEmbedding] = await ai.embeddings.embed([trimmed], {
    taskType: "query",
  });

  // `<=>` returns cosine distance (0 = identical). Similarity = 1 - distance.
  const distance = cosineDistance(chunks.embedding, queryEmbedding);
  const similarity = sql<number>`1 - (${distance})`;

  const rows = await db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      documentTitle: documents.title,
      documentFilename: documents.filename,
      chunkIndex: chunks.chunkIndex,
      page: chunks.page,
      charStart: chunks.charStart,
      charEnd: chunks.charEnd,
      content: chunks.content,
      similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(options.documentId ? eq(chunks.documentId, options.documentId) : undefined)
    .orderBy(distance) // ascending distance = most similar first
    .limit(topK);

  return rows;
}
