/**
 * CLI: ingest a local file into the database as embedded chunks.
 *
 *   npm run ingest ./sample.pdf
 *   npm run ingest -- ./notes.txt --force          # re-ingest a duplicate
 *   npm run ingest -- ./sample.pdf --dry-run        # parse + chunk only (no embed/DB)
 *   npm run ingest -- ./sample.txt --chunk-tokens 150 --overlap 30   # tune chunk size
 *
 * Flags (defaults in parens):
 *   --dry-run                parse + chunk only, no embedding/DB
 *   --force                  re-ingest even if the same content already exists
 *   --chunk-tokens <n>       target chunk size in tokens (800)
 *   --overlap <n>            overlap between chunks in tokens (150)
 *
 * NOTE: flags must come after `--`, otherwise npm intercepts them as its own
 * options. The positional file path needs no `--`.
 *
 * --dry-run needs no API key and no database — handy for sanity-checking the
 * parser and chunker before wiring up embeddings/Postgres.
 */
import { config } from "dotenv";

// Load env BEFORE importing anything that reads it (db client, provider).
config({ path: ".env.local" });

type Args = {
  filePath?: string;
  dryRun: boolean;
  force: boolean;
  /** Override target chunk size in tokens (default 800). */
  chunkTokens?: number;
  /** Override chunk overlap in tokens (default 150). */
  overlapTokens?: number;
};

function parseArgs(argv: string[]): Args {
  const result: Args = { dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--force") result.force = true;
    else if (arg === "--chunk-tokens") result.chunkTokens = Number(argv[++i]) || undefined;
    else if (arg === "--overlap") result.overlapTokens = Number(argv[++i]) || undefined;
    else if (!arg.startsWith("-") && !result.filePath) result.filePath = arg;
  }
  return result;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.filePath) {
    console.error("Usage: npm run ingest <file> [--dry-run] [--force]");
    process.exit(1);
  }

  console.log(`\n📄 Ingesting: ${args.filePath}${args.dryRun ? "  (dry run)" : ""}\n`);

  // --- Dry run: parse + chunk only, no DB/provider imports ---
  if (args.dryRun) {
    const { readAndPrepare } = await import("@/lib/ingest/prepare");
    const prepared = await readAndPrepare(args.filePath, {
      targetTokens: args.chunkTokens,
      overlapTokens: args.overlapTokens,
    });
    console.log(`  type:    ${prepared.mimeType}`);
    console.log(`  size:    ${fmtBytes(prepared.byteSize)}`);
    console.log(`  text:    ${prepared.text.length.toLocaleString()} chars`);
    console.log(`  pages:   ${prepared.pageCount ?? "n/a"}`);
    console.log(`  chunks:  ${prepared.chunks.length}`);

    const tokens = prepared.chunks.map((c) => c.tokenCount);
    if (tokens.length > 0) {
      const avg = Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length);
      console.log(`  tokens/chunk (est): min ${Math.min(...tokens)}, avg ${avg}, max ${Math.max(...tokens)}`);
    }

    const preview = prepared.chunks[0];
    if (preview) {
      console.log(`\n  first chunk [${preview.charStart}–${preview.charEnd}, page ${preview.page ?? "n/a"}]:`);
      console.log(`  "${preview.content.slice(0, 200).replace(/\s+/g, " ")}…"`);
    }
    console.log("\n✓ Dry run complete. No embeddings created, nothing stored.\n");
    return;
  }

  // --- Full ingestion ---
  const { ingestFile } = await import("@/lib/ingest/pipeline");
  const result = await ingestFile(args.filePath, {
    force: args.force,
    targetTokens: args.chunkTokens,
    overlapTokens: args.overlapTokens,
    onProgress: (event) => {
      switch (event.type) {
        case "prepared":
          console.log(
            `  parsed → ${event.chars.toLocaleString()} chars` +
              `${event.pageCount ? `, ${event.pageCount} pages` : ""}` +
              `, ${event.chunks} chunks`,
          );
          break;
        case "embedding":
          console.log(`  embedding ${event.done}/${event.total} chunks…`);
          break;
        case "storing":
          console.log(`  storing ${event.rows} chunks…`);
          break;
        case "skipped":
          console.log(`  already ingested (same content hash) — skipping.`);
          break;
      }
    },
  });

  if (result.skipped) {
    console.log(
      `\n↩  Document already present: ${result.documentId} (${result.chunkCount} chunks).` +
        `\n   Use --force to re-ingest.\n`,
    );
    return;
  }

  console.log(
    `\n✓ Stored document ${result.documentId}` +
      `\n  chunks:     ${result.chunkCount}` +
      `\n  embeddings: ${result.embeddingModel} (${result.embeddingDimensions} dims)\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Ingestion failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
