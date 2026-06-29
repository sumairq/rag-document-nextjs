import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { chunks, documents } from "@/db/schema";
import type { SourceResolution } from "@/lib/chat/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Resolves a citation (chunk id) to its source text with surrounding context.
 *
 * Because `content === original.slice(charStart, charEnd)` exactly and adjacent
 * chunks overlap, we trim each neighbor's overlapping region using the offsets
 * so `before + highlight + after` reads as one continuous, non-duplicated
 * excerpt of the document.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chunkId: string }> },
): Promise<Response> {
  const { chunkId } = await params;

  const [cited] = await db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      chunkIndex: chunks.chunkIndex,
      charStart: chunks.charStart,
      charEnd: chunks.charEnd,
      page: chunks.page,
      content: chunks.content,
      documentTitle: documents.title,
      documentFilename: documents.filename,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(eq(chunks.id, chunkId))
    .limit(1);

  if (!cited) {
    return new Response(JSON.stringify({ error: "Chunk not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch immediate neighbors for context.
  const neighbors = await db
    .select({
      chunkIndex: chunks.chunkIndex,
      charStart: chunks.charStart,
      charEnd: chunks.charEnd,
      content: chunks.content,
    })
    .from(chunks)
    .where(
      and(
        eq(chunks.documentId, cited.documentId),
        inArray(chunks.chunkIndex, [cited.chunkIndex - 1, cited.chunkIndex + 1]),
      ),
    );

  const prev = neighbors.find((n) => n.chunkIndex === cited.chunkIndex - 1);
  const next = neighbors.find((n) => n.chunkIndex === cited.chunkIndex + 1);

  // Trim each neighbor's overlap using exact offsets. Requires offsets on both
  // the cited chunk and the neighbor; otherwise we omit that side of context.
  let before = "";
  if (prev && cited.charStart != null && prev.charStart != null) {
    const cut = clamp(cited.charStart - prev.charStart, 0, prev.content.length);
    before = prev.content.slice(0, cut);
  }

  let after = "";
  if (next && cited.charEnd != null && next.charStart != null) {
    const cut = clamp(cited.charEnd - next.charStart, 0, next.content.length);
    after = next.content.slice(cut);
  }

  const body: SourceResolution = {
    chunkId: cited.id,
    documentId: cited.documentId,
    documentTitle: cited.documentTitle,
    documentFilename: cited.documentFilename,
    chunkIndex: cited.chunkIndex,
    page: cited.page,
    before,
    highlight: cited.content,
    after,
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
