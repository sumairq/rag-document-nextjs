import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { chunks as chunksTable, documents } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { classifyError } from "@/lib/errors";

import type { ChunkOptions } from "./chunk";
import { prepareDocument, readAndPrepare, type PreparedDocument } from "./prepare";

// Gemini's embedContent accepts a batch of texts per call; keep batches modest
// to stay within request limits and to surface progress.
const EMBED_BATCH_SIZE = 100;
// Rows per insert statement — bounds the bound-parameter count per query.
const INSERT_BATCH_SIZE = 500;

/** Progress events so callers (the CLI) can show work as it happens. */
export type IngestEvent =
  | { type: "prepared"; chars: number; chunks: number; pageCount: number | null }
  | { type: "embedding"; done: number; total: number }
  | { type: "storing"; rows: number }
  | { type: "skipped"; documentId: string };

export interface IngestOptions extends ChunkOptions {
  /** Collection the document belongs to (required — documents are scoped). */
  collectionId: string;
  /** Re-ingest even if the same content already exists in this collection. */
  force?: boolean;
  onProgress?: (event: IngestEvent) => void;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  /** True if an identical document already existed and we left it untouched. */
  skipped: boolean;
  embeddingModel: string;
  embeddingDimensions: number;
}

/**
 * Core ingestion of an already-parsed document: embed → store.
 *
 * The document row is created up front with status "processing", and only
 * flipped to "ready" inside the same transaction that writes the chunks — so a
 * partially-ingested document is never visible as ready. Failures flip it to
 * "failed" with the error recorded. Dedupe is scoped to the collection.
 */
export async function storePrepared(
  prepared: PreparedDocument,
  options: IngestOptions,
): Promise<IngestResult> {
  const { collectionId, force, onProgress } = options;
  const ai = getAIProvider();

  onProgress?.({
    type: "prepared",
    chars: prepared.text.length,
    chunks: prepared.chunks.length,
    pageCount: prepared.pageCount,
  });

  // Dedupe by content hash within the collection (the same file may live in
  // multiple collections).
  const existing = await db.query.documents.findFirst({
    where: and(
      eq(documents.collectionId, collectionId),
      eq(documents.contentHash, prepared.contentHash),
    ),
  });
  if (existing && !force) {
    onProgress?.({ type: "skipped", documentId: existing.id });
    return {
      documentId: existing.id,
      chunkCount: existing.chunkCount,
      skipped: true,
      embeddingModel: ai.embeddings.model,
      embeddingDimensions: ai.embeddings.dimensions,
    };
  }
  if (existing && force) {
    await db.delete(documents).where(eq(documents.id, existing.id)); // cascades chunks
  }

  const [doc] = await db
    .insert(documents)
    .values({
      collectionId,
      title: prepared.filename,
      filename: prepared.filename,
      mimeType: prepared.mimeType,
      byteSize: prepared.byteSize,
      contentHash: prepared.contentHash,
      status: "processing",
    })
    .returning({ id: documents.id });

  try {
    // --- Embed (batched) ---
    const texts = prepared.chunks.map((c) => c.content);
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const embedded = await ai.embeddings.embed(batch, { taskType: "document" });
      vectors.push(...embedded);
      onProgress?.({
        type: "embedding",
        done: Math.min(i + batch.length, texts.length),
        total: texts.length,
      });
    }

    const rows = prepared.chunks.map((chunk, i) => ({
      documentId: doc.id,
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: vectors[i],
      page: chunk.page,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
    }));

    // --- Store (chunks + status flip, atomically) ---
    onProgress?.({ type: "storing", rows: rows.length });
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        await tx.insert(chunksTable).values(rows.slice(i, i + INSERT_BATCH_SIZE));
      }
      await tx
        .update(documents)
        .set({ status: "ready", chunkCount: rows.length, updatedAt: new Date() })
        .where(eq(documents.id, doc.id));
    });

    return {
      documentId: doc.id,
      chunkCount: rows.length,
      skipped: false,
      embeddingModel: ai.embeddings.model,
      embeddingDimensions: ai.embeddings.dimensions,
    };
  } catch (error) {
    // Store a concise, user-readable reason (not raw provider JSON).
    const { message } = classifyError(error, "ingest");
    await db
      .update(documents)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(documents.id, doc.id));
    throw error;
  }
}

/** Ingest a file from disk (CLI / seeding). */
export async function ingestFile(
  filePath: string,
  options: IngestOptions,
): Promise<IngestResult> {
  const prepared = await readAndPrepare(filePath, options);
  return storePrepared(prepared, options);
}

/** Ingest an uploaded file already in memory (browser upload). */
export async function ingestUpload(
  buffer: Buffer,
  filename: string,
  options: IngestOptions,
): Promise<IngestResult> {
  const prepared = await prepareDocument(buffer, filename, options);
  return storePrepared(prepared, options);
}
