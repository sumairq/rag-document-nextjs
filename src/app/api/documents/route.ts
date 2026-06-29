import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { getCollectionById } from "@/lib/collections";
import { classifyError } from "@/lib/errors";
import { ingestUpload } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reject obviously-too-large uploads early (parsing/embedding a huge file would
// be slow and costly). 20 MB is plenty for PDFs/DOCX/TXT here.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** GET /api/documents?collectionId=... — list documents in a collection. */
export async function GET(req: Request): Promise<Response> {
  const collectionId = new URL(req.url).searchParams.get("collectionId");
  if (!collectionId) {
    return Response.json({ error: "collectionId is required." }, { status: 400 });
  }

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      filename: documents.filename,
      mimeType: documents.mimeType,
      byteSize: documents.byteSize,
      status: documents.status,
      chunkCount: documents.chunkCount,
      error: documents.error,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.collectionId, collectionId))
    .orderBy(desc(documents.createdAt));

  return Response.json({ documents: rows });
}

/** POST /api/documents — multipart upload (file + collectionId) → ingest. */
export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const collectionId = form.get("collectionId");

  if (!(file instanceof File)) {
    return Response.json({ error: "A file is required." }, { status: 400 });
  }
  if (typeof collectionId !== "string" || !collectionId) {
    return Response.json({ error: "collectionId is required." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File exceeds the 20 MB limit." }, { status: 413 });
  }

  const collection = await getCollectionById(collectionId);
  if (!collection) {
    return Response.json({ error: "Collection not found." }, { status: 404 });
  }
  if (collection.isSample) {
    return Response.json(
      { error: "Sample collections are read-only. Create your own collection to upload." },
      { status: 403 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await ingestUpload(buffer, file.name, { collectionId });
    return Response.json(result, { status: result.skipped ? 200 : 201 });
  } catch (err) {
    console.error("[/api/documents] ingestion failed:", err);
    const { status, message } = classifyError(err, "ingest");
    return Response.json({ error: message }, { status });
  }
}
