import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Embedding dimension. Gemini `text-embedding-004` returns 768-dim vectors.
 * If you swap to a model with a different dimension, change this AND generate
 * a new migration (the column type `vector(N)` is fixed at the DB level).
 */
export const EMBEDDING_DIMENSIONS = 768;

/** Ingestion lifecycle for an uploaded document. */
export const documentStatus = pgEnum("document_status", [
  "pending", // accepted, not yet processed
  "processing", // parsing / chunking / embedding in flight
  "ready", // fully embedded and queryable
  "failed", // ingestion errored (see `error`)
]);

/**
 * One uploaded source document. Holds file-level metadata and ingestion state;
 * the actual searchable text lives in `chunks`.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Human-readable name shown in the UI (defaults to the filename).
    title: text("title").notNull(),
    // Original upload filename.
    filename: text("filename").notNull(),
    // MIME type, used to pick the right parser during ingestion.
    mimeType: text("mime_type").notNull(),
    // File size in bytes (observability / upload limits).
    byteSize: integer("byte_size").notNull(),
    // SHA-256 of the file bytes. Enables dedupe and idempotent re-ingestion.
    contentHash: text("content_hash").notNull(),
    // Where ingestion currently is for this document.
    status: documentStatus("status").notNull().default("pending"),
    // Failure reason when status = 'failed'.
    error: text("error"),
    // Denormalized count of chunks, so listing documents doesn't need a join.
    chunkCount: integer("chunk_count").notNull().default(0),
    // Arbitrary extra metadata (source URL, author, original page count, ...).
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Fast dedupe lookups by file hash.
    index("documents_content_hash_idx").on(table.contentHash),
    // Filtering document lists by ingestion state.
    index("documents_status_idx").on(table.status),
  ],
);

/**
 * A retrievable slice of a document: its text, embedding, and the location
 * metadata needed to cite it back to the source.
 */
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Parent document. Deleting a document removes its chunks.
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Ordinal position within the document (0-based). Used for stable ordering
    // and as part of a citation ("chunk 3 of doc X").
    chunkIndex: integer("chunk_index").notNull(),
    // The chunk text — what gets embedded and fed to the LLM as context.
    content: text("content").notNull(),
    // Token count of `content` (nullable; filled during ingestion). Lets the
    // query step budget how many chunks fit in the model's context window.
    tokenCount: integer("token_count"),
    // The embedding vector for similarity search.
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    // Source page number (PDFs etc.) for citations. Nullable for formats
    // without pages (e.g. plain text / markdown).
    page: integer("page"),
    // Character offsets of this chunk within the document's extracted text.
    // Enables precise citation highlighting back to the original. Nullable.
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    // Extra per-chunk metadata (section heading, etc.).
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // FK lookups + cascade deletes by document.
    index("chunks_document_id_idx").on(table.documentId),
    // No duplicate ordinals within a document; makes re-ingestion deterministic.
    uniqueIndex("chunks_document_id_chunk_index_idx").on(
      table.documentId,
      table.chunkIndex,
    ),
    // Approximate-nearest-neighbor index for cosine similarity search.
    // Cosine pairs with the `<=>` operator at query time.
    index("chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, {
    fields: [chunks.documentId],
    references: [documents.id],
  }),
}));

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
