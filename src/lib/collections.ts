import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { collections, documents, type Collection } from "@/db/schema";

export interface CollectionWithCount extends Collection {
  documentCount: number;
}

/** All collections with their document counts, for switchers and the corpus UI. */
export async function listCollections(): Promise<CollectionWithCount[]> {
  return db
    .select({
      id: collections.id,
      slug: collections.slug,
      name: collections.name,
      description: collections.description,
      isSample: collections.isSample,
      createdAt: collections.createdAt,
      documentCount: sql<number>`count(${documents.id})::int`,
    })
    .from(collections)
    .leftJoin(documents, eq(documents.collectionId, collections.id))
    .groupBy(collections.id)
    .orderBy(asc(collections.name));
}

export async function getCollectionById(id: string): Promise<Collection | undefined> {
  const [row] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);
  return row;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection"
  );
}

/** Create a collection from a display name, generating a unique slug. */
export async function createCollection(
  name: string,
  description?: string,
): Promise<Collection> {
  const base = slugify(name);
  let slug = base;
  // Resolve slug collisions deterministically.
  for (let i = 2; ; i++) {
    const existing = await db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    slug = `${base}-${i}`;
  }

  const [row] = await db
    .insert(collections)
    .values({ slug, name: name.trim(), description })
    .returning();
  return row;
}

/** Idempotently ensure a collection with `slug` exists (used by seeding). */
export async function ensureCollection(input: {
  slug: string;
  name: string;
  description?: string;
  isSample?: boolean;
}): Promise<Collection> {
  await db
    .insert(collections)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description,
      isSample: input.isSample ?? false,
    })
    .onConflictDoNothing({ target: collections.slug });

  const [row] = await db
    .select()
    .from(collections)
    .where(eq(collections.slug, input.slug))
    .limit(1);
  return row;
}
