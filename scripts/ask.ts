/**
 * CLI: ask a question and get a grounded, cited answer (retrieval + LLM).
 *
 *   npm run ask "what are the two main phases of a RAG system?"
 *   npm run ask -- "cosine vs L2" --k 8
 *   npm run ask -- "what is X?" --doc <document-id>
 *
 * Flags (--k, --doc) must come after `--`; the quoted question does not.
 */
import { config } from "dotenv";

// Load env BEFORE importing anything that reads it (db client, provider).
config({ path: ".env.local" });

type Args = { question?: string; topK: number; documentId?: string };

function parseArgs(argv: string[]): Args {
  const result: Args = { topK: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--k") result.topK = Number(argv[++i]) || result.topK;
    else if (arg === "--doc") result.documentId = argv[++i];
    else if (!arg.startsWith("-") && !result.question) result.question = arg;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.question) {
    console.error('Usage: npm run ask "your question" [-- --k N --doc <id>]');
    process.exit(1);
  }

  const { answerQuestion } = await import("@/lib/generation/answer");
  const result = await answerQuestion(args.question, {
    topK: args.topK,
    documentId: args.documentId,
  });

  console.log(`\n❓ ${result.question}\n`);
  console.log(`${result.answer}\n`);

  if (result.answerable && result.citations.length > 0) {
    console.log("Citations:");
    for (const c of result.citations) {
      const loc =
        `chunk ${c.chunkIndex}` + (c.page != null ? `, page ${c.page}` : "");
      console.log(
        `  [${c.marker}] ${c.documentFilename} (${loc})  ` +
          `score ${c.similarity.toFixed(4)}  chunk_id ${c.chunkId}`,
      );
    }
  } else {
    console.log("Citations: (none — not answerable from the documents)");
  }

  // Footnote: what was retrieved, so you can see the grounding even when the
  // model declined to answer.
  console.log(`\nRetrieved ${result.retrieved.length} chunk(s):`);
  result.retrieved.forEach((hit, i) => {
    console.log(
      `  [${i + 1}] ${hit.documentFilename} chunk ${hit.chunkIndex}  score ${hit.similarity.toFixed(4)}`,
    );
  });
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Ask failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
