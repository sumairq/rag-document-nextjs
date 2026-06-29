# Architecture

A RAG (retrieval-augmented generation) app: users upload documents, then chat
with an AI that answers **only** from those documents and cites its sources.

This document describes the full intended data flow, the database schema and the
reasoning behind each column, the AI provider abstraction, and the folder
structure. **Only the foundation is built so far** — ingestion, retrieval, and
the chat UI are designed here but not yet implemented (see
[Current status](#current-status)).

---

## High-level flow

```
                 INGESTION (write path)
  upload ──▶ parse ──▶ chunk ──▶ embed ──▶ store
   file      text     pieces    vectors   Postgres + pgvector

                 QUERY (read path)
  question ──▶ embed ──▶ retrieve ──▶ assemble ──▶ generate ──▶ cite
              query     top-k chunks   context     LLM answer   sources
              vector    (cosine ANN)
```

Both paths share two pluggable capabilities — **embeddings** and **LLM
generation** — behind a provider interface (default: Google Gemini).

---

## Ingestion (write path)

When a user uploads a document:

1. **Parse** — Extract plain text from the uploaded file based on its MIME type
   (PDF, DOCX, Markdown, plain text, …). A row is created in `documents` with
   `status = 'pending'`, the original filename, MIME type, byte size, and a
   SHA-256 `content_hash` of the bytes. The hash lets us detect re-uploads of
   the same file and make ingestion idempotent.
2. **Chunk** — Split the extracted text into overlapping, retrieval-sized pieces
   (e.g. ~500–1000 tokens with overlap). Each chunk records its ordinal
   `chunk_index`, optional source `page`, and `char_start`/`char_end` offsets in
   the extracted text — everything needed to cite it later.
3. **Embed** — Call the embedding provider with `taskType: "document"` to turn
   each chunk's text into a 768-dim vector.
4. **Store** — Insert one `chunks` row per chunk (text + embedding + location
   metadata) linked to the parent document. On success, set the document's
   `status = 'ready'` and `chunk_count`. On failure, set `status = 'failed'`
   and record the reason in `error`.

The `documents.status` column makes this a visible state machine
(`pending → processing → ready | failed`) so the UI can show ingestion progress.

## Query (read path)

When a user asks a question:

1. **Embed the query** — Embed the question with `taskType: "query"` using the
   same model (so query and document vectors live in the same space).
2. **Retrieve** — Find the top-k most similar chunks by **cosine distance**
   using pgvector's `<=>` operator, accelerated by the HNSW index on
   `chunks.embedding`. (Optionally scope to a specific document or filter by
   `documents.status = 'ready'`.)
3. **Assemble context** — Concatenate the retrieved chunk texts into a prompt,
   each tagged with a citation marker that maps back to its `document_id` +
   `chunk_index` (and `page`/char offsets).
4. **Generate** — Send the question + context to the LLM provider with a system
   instruction to answer **only** from the provided context and to cite the
   chunks it used.
5. **Cite** — Return the answer along with the source chunks, so the UI can link
   each citation back to the exact document, page, and character span.

---

## Database

**Postgres 17 + the [pgvector](https://github.com/pgvector/pgvector) extension**,
run locally via Docker (`docker-compose.yml`, image `pgvector/pgvector:pg17`).
The `vector` extension is created two ways for robustness:

- `docker/init/01-extensions.sql` runs on first container init, so a fresh dev
  database always has it.
- The first migration (`drizzle/0000_*.sql`) begins with
  `CREATE EXTENSION IF NOT EXISTS vector;`, so the schema is self-contained on
  any environment (CI, prod, a non-Docker Postgres).

### Why Drizzle ORM (with a raw-SQL escape hatch)

We use **Drizzle ORM** for the schema definition, migrations (via `drizzle-kit`),
and ordinary CRUD. Drizzle has a first-class `vector` column type and HNSW index
helpers for pgvector, so we get type-safe schema and generated migrations
**without** giving up vector ergonomics.

The one place raw SQL is genuinely cleaner is the **nearest-neighbor query**:
ordering by the `<=>` cosine operator. When retrieval is built, that single
query will use Drizzle's `sql` template literal to express the operator and the
HNSW-backed ordering. Net rule: **Drizzle everywhere; raw SQL only for the
distance-ordered KNN search.**

Driver: [`postgres`](https://github.com/porsager/postgres) (postgres.js) via
`drizzle-orm/postgres-js`.

### `documents`

One row per uploaded source file.

| Column         | Type                       | Why it exists                                                            |
| -------------- | -------------------------- | ------------------------------------------------------------------------ |
| `id`           | `uuid` PK                  | Stable identifier referenced by chunks and citations.                    |
| `title`        | `text`                     | Human-readable name shown in the UI (defaults to filename).              |
| `filename`     | `text`                     | Original upload filename.                                                |
| `mime_type`    | `text`                     | Selects the right parser during ingestion.                              |
| `byte_size`    | `integer`                  | Observability and upload-limit enforcement.                              |
| `content_hash` | `text`                     | SHA-256 of file bytes → dedupe + idempotent re-ingestion.                |
| `status`       | `document_status` enum     | Ingestion state machine: `pending`/`processing`/`ready`/`failed`.        |
| `error`        | `text` (nullable)          | Failure reason when `status = 'failed'`.                                 |
| `chunk_count`  | `integer`                  | Denormalized count so document lists don't need a join.                  |
| `metadata`     | `jsonb` (nullable)         | Open-ended extras (source URL, author, original page count, …).          |
| `created_at`   | `timestamptz`              | Audit / sorting.                                                         |
| `updated_at`   | `timestamptz`              | Audit / sorting.                                                         |

Indexes: `content_hash` (dedupe lookups), `status` (filtering lists).

### `chunks`

One row per retrievable slice of a document. This is the table similarity search
runs against.

| Column        | Type                        | Why it exists                                                                  |
| ------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `id`          | `uuid` PK                   | Stable identifier for citations.                                               |
| `document_id` | `uuid` FK → `documents.id`  | Parent document; `ON DELETE CASCADE` removes chunks with their document.       |
| `chunk_index` | `integer`                   | 0-based ordinal within the document — stable ordering + part of a citation.    |
| `content`     | `text`                      | The chunk text: what gets embedded and fed to the LLM as context.             |
| `token_count` | `integer` (nullable)        | Lets the query step budget how many chunks fit the model's context window.     |
| `embedding`   | `vector(768)`               | The embedding used for cosine similarity search.                               |
| `page`        | `integer` (nullable)        | Source page for citations (PDFs). Null for formats without pages.              |
| `char_start`  | `integer` (nullable)        | Start offset in the document's extracted text — precise citation highlighting. |
| `char_end`    | `integer` (nullable)        | End offset, paired with `char_start`.                                          |
| `metadata`    | `jsonb` (nullable)          | Per-chunk extras (section heading, …).                                         |
| `created_at`  | `timestamptz`               | Audit.                                                                          |

Indexes:

- **HNSW** on `embedding` using `vector_cosine_ops` — approximate-nearest-neighbor
  search for the read path.
- B-tree on `document_id` — FK lookups and cascade deletes.
- **Unique** on `(document_id, chunk_index)` — no duplicate ordinals per
  document; makes re-ingestion deterministic.

### Why cosine + HNSW

- **Cosine distance** (`vector_cosine_ops`, `<=>` operator) is the standard
  similarity measure for text embeddings; it ignores vector magnitude and
  compares direction, which is what semantic similarity needs.
- **HNSW** gives high-recall approximate search that scales to large chunk
  counts, with no separate "training" step (unlike IVFFlat). Defaults are fine
  to start; `ef_construction`/`m` can be tuned later.

### Embedding dimension

`text-embedding-004` emits **768-dim** vectors, so the column is `vector(768)`
and `EMBEDDING_DIMENSIONS` in `src/db/schema.ts` is the single source of truth.
Changing models with a different dimension requires updating that constant **and**
generating a new migration (the `vector(N)` size is fixed at the DB level).

---

## AI provider abstraction

Embeddings and LLM calls sit behind small interfaces in `src/lib/ai/types.ts`:

- `EmbeddingProvider` — `embed(texts, { taskType })`, plus `model` and
  `dimensions`.
- `LLMProvider` — `generate(prompt, { system, temperature, maxOutputTokens })`.
- `AIProvider` — bundles both.

`src/lib/ai/gemini.ts` implements these with the official `@google/genai` SDK
(`text-embedding-004` for embeddings, `gemini-2.0-flash` for generation).
`src/lib/ai/index.ts` exposes `getAIProvider()`, a factory that reads
`AI_PROVIDER` from the environment.

**Swapping providers** (e.g. to OpenAI) is a two-step, additive change:

1. Add `src/lib/ai/openai.ts` exporting `createOpenAIProvider(): AIProvider`.
2. Add a `case "openai"` to the factory in `index.ts`.

The rest of the app imports only `getAIProvider()` and the interface types, so no
feature code changes when the provider changes.

---

## Folder structure

```
rag-app/
├── docker-compose.yml          # Postgres 17 + pgvector for local dev
├── docker/init/
│   └── 01-extensions.sql       # CREATE EXTENSION vector (first-init only)
├── drizzle.config.ts           # drizzle-kit config (schema path, migrations out dir)
├── drizzle/                    # generated SQL migrations + metadata
│   └── 0000_*.sql              # initial schema (+ CREATE EXTENSION prepended)
├── .env.example                # documented env template (committed)
├── .env.local                  # real local secrets (gitignored)
├── ARCHITECTURE.md             # this file
├── src/
│   ├── app/                    # Next.js App Router (layout, placeholder page)
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema: documents + chunks (+ EMBEDDING_DIMENSIONS)
│   │   ├── index.ts            # Drizzle client over postgres.js (server-only)
│   │   └── migrate.ts          # `npm run db:migrate` runner
│   └── lib/ai/
│       ├── types.ts            # provider-agnostic interfaces
│       ├── gemini.ts           # Gemini implementation (@google/genai)
│       └── index.ts            # getAIProvider() factory
└── package.json                # scripts: dev, db:generate, db:migrate, db:up, ...
```

---

## Current status

**Built (foundation):** project scaffold, Docker/pgvector setup, full
`documents` + `chunks` schema and initial migration, and the AI provider
interface with a Gemini implementation.

**Not built yet (designed above):** document upload/parsing, chunking, the
ingestion pipeline, the retrieval/KNN query, the chat UI, and any code that
actually calls the embedding or LLM provider. The Gemini provider exists and
compiles but is not invoked anywhere yet.
