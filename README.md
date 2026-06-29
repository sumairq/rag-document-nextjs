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

## Scripts

| Script               | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the Next.js dev server                 |
| `npm run build`      | Production build                             |
| `npm run typecheck`  | `tsc --noEmit`                               |
| `npm run lint`       | ESLint                                       |
| `npm run db:up`      | Start Postgres + pgvector (Docker)           |
| `npm run db:down`    | Stop the database container                  |
| `npm run db:generate`| Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply pending migrations                     |
| `npm run db:studio`  | Open Drizzle Studio                          |
