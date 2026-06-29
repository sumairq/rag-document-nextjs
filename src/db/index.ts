import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

/**
 * Reuse a single postgres.js connection across hot reloads in development,
 * otherwise Next.js would open a new pool on every change and exhaust
 * connections.
 */
const globalForDb = globalThis as unknown as {
  __ragPgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.__ragPgClient ?? postgres(connectionString);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__ragPgClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
