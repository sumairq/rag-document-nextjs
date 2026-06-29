import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { collections, documents } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/documents/[id] — remove a document and (via cascade) its chunks. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // Look up the document's collection so we can protect read-only samples.
  const [doc] = await db
    .select({ id: documents.id, isSample: collections.isSample })
    .from(documents)
    .innerJoin(collections, eq(documents.collectionId, collections.id))
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.isSample) {
    return Response.json(
      { error: "Sample collections are read-only." },
      { status: 403 },
    );
  }

  await db.delete(documents).where(eq(documents.id, id));
  return Response.json({ deleted: id });
}
