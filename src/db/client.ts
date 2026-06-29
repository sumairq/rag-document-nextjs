import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * The Drizzle client. This module has NO `server-only` guard so it can also be
 * used from standalone tooling that runs outside Next.js (e.g. the ingest CLI
 * and migration runner). Application code should import from `@/db` instead,
 * which adds the guard. Either way you get the same `db` instance.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

// Reuse one postgres.js connection across hot reloads in development, otherwise
// Next.js would open a new pool on every change and exhaust connections.
const globalForDb = globalThis as unknown as {
  __ragPgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.__ragPgClient ?? postgres(connectionString);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__ragPgClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
