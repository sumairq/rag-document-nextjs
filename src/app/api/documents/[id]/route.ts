import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { documents } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/documents/[id] — remove a document and (via cascade) its chunks. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const deleted = await db
    .delete(documents)
    .where(eq(documents.id, id))
    .returning({ id: documents.id });

  if (deleted.length === 0) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  return Response.json({ deleted: deleted[0].id });
}
