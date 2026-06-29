/**
 * CLI: run a similarity search over ingested chunks. Retrieval only — no LLM.
 *
 *   npm run search "what is chunk overlap for?"
 *   npm run search -- "cosine vs L2" --k 10
 *   npm run search -- "pgvector index" --doc <document-id>
 *
 * Flags (--k, --doc) must come after `--`; the quoted query does not.
 */
import { config } from "dotenv";

// Load env BEFORE importing anything that reads it (db client, provider).
config({ path: ".env.local" });

type Args = { query?: string; topK: number; documentId?: string };

function parseArgs(argv: string[]): Args {
  const result: Args = { topK: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--k") result.topK = Number(argv[++i]) || result.topK;
    else if (arg === "--doc") result.documentId = argv[++i];
    else if (!arg.startsWith("-") && !result.query) result.query = arg;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.query) {
    console.error('Usage: npm run search "your question" [-- --k N --doc <id>]');
    process.exit(1);
  }

  const { search } = await import("@/lib/retrieval/search");
  const hits = await search(args.query, {
    topK: args.topK,
    documentId: args.documentId,
  });

  console.log(`\n🔎 Query: "${args.query}"`);
  console.log(`   top ${args.topK}${args.documentId ? `, doc ${args.documentId}` : ""}\n`);

  if (hits.length === 0) {
    console.log("No chunks found. Have you ingested any documents yet?\n");
    return;
  }

  hits.forEach((hit, i) => {
    const loc =
      `chunk ${hit.chunkIndex}` + (hit.page != null ? `, page ${hit.page}` : "");
    console.log(
      `#${i + 1}  score ${hit.similarity.toFixed(4)}  ` +
        `— ${hit.documentFilename} (${loc})`,
    );
    const preview = hit.content.replace(/\s+/g, " ").slice(0, 220);
    console.log(`    ${preview}${hit.content.length > 220 ? "…" : ""}\n`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Search failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
