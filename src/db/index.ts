import "server-only";

// App-facing DB entrypoint. The `server-only` import above ensures this module
// (and the DB connection) can never be bundled into a client component. The
// actual client lives in `./client`, which is also used by standalone tooling
// (ingest CLI, migrations) that runs outside Next.js.
export { db, schema } from "./client";
