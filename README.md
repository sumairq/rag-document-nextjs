# RAG App

Upload documents, then chat with an AI that answers **only** from those
documents, with citations back to the source.

**Stack:** Next.js (App Router) + TypeScript + Tailwind · Postgres + pgvector ·
Drizzle ORM · Google Gemini (swappable provider).

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data flow, schema, and
design rationale.

> **Status:** foundation only. Ingestion, retrieval, and the chat UI are not
> built yet.

## Prerequisites

- Node.js 20+ and npm
- Docker (with the daemon running)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then edit .env.local and set GEMINI_API_KEY (from https://aistudio.google.com/apikey)

# 3. Start Postgres + pgvector
npm run db:up

# 4. Apply the database schema
npm run db:migrate

# 5. Run the dev server
npm run dev
```

App runs at http://localhost:3000.

### Confirm pgvector loaded

```bash
docker compose exec db psql -U postgres -d ragdb \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

> **Docker permissions:** if you get `permission denied … /var/run/docker.sock`,
> add yourself to the `docker` group once with
> `sudo usermod -aG docker $USER` and open a new shell, or prefix the `docker`
> commands above with `sudo`.

## Ingesting documents

Turn a local file (PDF, DOCX, TXT/MD) into stored, embedded chunks:

```bash
npm run ingest ./sample.txt              # parse → chunk → embed → store
npm run ingest -- ./sample.pdf --dry-run # parse + chunk only (no API key / DB needed)
npm run ingest -- ./sample.txt --force   # re-ingest a duplicate (same content hash)
```

> Flags must come after `--` so npm doesn't intercept them. The file path
> doesn't. A full run requires `GEMINI_API_KEY` set and the database running;
> `--dry-run` requires neither.

## Searching (retrieval only)

Run a vector similarity search over ingested chunks — no LLM involved:

```bash
npm run search "what is chunk overlap for?"
npm run search -- "cosine vs L2 distance" --k 10   # flags after --
npm run search -- "pgvector index" --doc <document-id>
```

Prints the top-k chunks ranked by cosine similarity, each with its score and
source document.

### Inspect what landed

```bash
# Documents
docker compose exec db psql -U postgres -d ragdb -c \
  "SELECT id, filename, status, chunk_count, byte_size FROM documents ORDER BY created_at DESC;"

# Chunks for the most recent document (text previewed)
docker compose exec db psql -U postgres -d ragdb -c \
  "SELECT chunk_index, page, char_start, char_end, token_count, left(content, 60) AS preview
   FROM chunks
   WHERE document_id = (SELECT id FROM documents ORDER BY created_at DESC LIMIT 1)
   ORDER BY chunk_index;"

# Embedding sanity check: every vector should report 768 dims, and none null
docker compose exec db psql -U postgres -d ragdb -c \
  "SELECT DISTINCT vector_dims(embedding) AS dims, count(*) FROM chunks GROUP BY 1;"
docker compose exec db psql -U postgres -d ragdb -c \
  "SELECT count(*) AS null_embeddings FROM chunks WHERE embedding IS NULL;"
```

## Scripts

| Script               | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the Next.js dev server                 |
| `npm run build`      | Production build                             |
| `npm run typecheck`  | `tsc --noEmit`                               |
| `npm run lint`       | ESLint                                       |
| `npm run ingest`     | Ingest a local file (see above)              |
| `npm run search`     | Vector similarity search over chunks         |
| `npm run db:up`      | Start Postgres + pgvector (Docker)           |
| `npm run db:down`    | Stop the database container                  |
| `npm run db:generate`| Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply pending migrations                     |
| `npm run db:studio`  | Open Drizzle Studio                          |
