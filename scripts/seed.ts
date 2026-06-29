/**
 * Seeds the preloaded sample corpora so a first-time visitor sees value without
 * uploading anything. Idempotent: collections are upserted by slug, and the
 * ingestion pipeline dedupes documents by content hash within a collection.
 *
 *   npm run seed
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

interface SampleCollection {
  slug: string;
  name: string;
  description: string;
  dir: string;
}

const SAMPLES: SampleCollection[] = [
  {
    slug: "product-manual",
    name: "Product Manual",
    description: "Acme SmartHub X1 setup and troubleshooting guides.",
    dir: "seeds/product-manual",
  },
  {
    slug: "company-policies",
    name: "Company Policies",
    description: "Remote work and data retention policies.",
    dir: "seeds/policies",
  },
  {
    slug: "research-papers",
    name: "Research Papers",
    description: "Summaries of Transformers and vector-database search.",
    dir: "seeds/papers",
  },
];

async function main() {
  const { ensureCollection } = await import("@/lib/collections");
  const { ingestFile } = await import("@/lib/ingest/pipeline");

  for (const sample of SAMPLES) {
    const collection = await ensureCollection({
      slug: sample.slug,
      name: sample.name,
      description: sample.description,
      isSample: true,
    });
    console.log(`\n📚 ${sample.name} (${sample.slug})`);

    const files = (await readdir(sample.dir))
      .filter((f) => /\.(md|txt|pdf|docx)$/i.test(f))
      .sort();

    for (const file of files) {
      const path = join(sample.dir, file);
      const result = await ingestFile(path, { collectionId: collection.id });
      console.log(
        `  ${result.skipped ? "↩ exists" : "✓ ingested"}  ${file} ` +
          `(${result.chunkCount} chunks)`,
      );
    }
  }

  console.log("\n✓ Seeding complete.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Seeding failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
