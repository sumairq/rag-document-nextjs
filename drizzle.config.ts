import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load env from .env.local (Next's convention) for CLI commands.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Keep `vector` from being flagged as an unmanaged extension during diffing.
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
