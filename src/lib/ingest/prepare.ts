import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { chunkText, type ChunkOptions, type TextChunk } from "./chunk";
import { resolveParser, supportedExtensions } from "./parsers";

// Below this many non-whitespace characters we treat the parse as effectively
// empty (e.g. a scanned PDF whose text layer is just stray artifacts).
const MIN_TEXT_LENGTH = 20;
// Upper bound on chunks per document for this demo, so a huge file fails fast
// with a clear message instead of hanging into embedding rate limits/timeouts.
const MAX_CHUNKS = 250;

/**
 * Everything derived from a file *before* any network or database work: file
 * metadata, the extracted text, and the chunks. Kept free of DB/provider
 * imports so it can run standalone (e.g. the CLI's --dry-run).
 */
export interface PreparedDocument {
  filename: string;
  mimeType: string;
  byteSize: number;
  /** SHA-256 of the file bytes — used for dedupe / idempotent re-ingestion. */
  contentHash: string;
  text: string;
  /** Number of pages if the format had them, else null. */
  pageCount: number | null;
  chunks: TextChunk[];
}

/**
 * Parses + chunks a file already in memory. Used by browser uploads (which give
 * us bytes, not a path) and by `readAndPrepare`. No embedding, no DB.
 */
export async function prepareDocument(
  buffer: Buffer,
  filename: string,
  options?: ChunkOptions,
): Promise<PreparedDocument> {
  const resolved = resolveParser(filename);
  if (!resolved) {
    throw new Error(
      `Unsupported file type for "${filename}". Supported: ${supportedExtensions().join(", ")}`,
    );
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");

  const { text, pages } = await resolved.parser.parse(buffer);
  if (text.trim().length < MIN_TEXT_LENGTH) {
    throw new Error(
      resolved.extension === ".pdf"
        ? "This PDF has no selectable text — it may be scanned or image-only, and OCR isn’t supported."
        : "No extractable text found in the file.",
    );
  }

  const chunks = chunkText(text, pages, options);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `This document is too large for the demo (${chunks.length} sections, max ${MAX_CHUNKS}); please try a smaller file.`,
    );
  }

  return {
    filename: basename(filename),
    mimeType: resolved.mimeType,
    byteSize: buffer.byteLength,
    contentHash,
    text,
    pageCount: pages?.length ?? null,
    chunks,
  };
}

/** Reads a file from disk, then prepares it. Used by the CLI. */
export async function readAndPrepare(
  filePath: string,
  options?: ChunkOptions,
): Promise<PreparedDocument> {
  const buffer = await readFile(filePath);
  return prepareDocument(buffer, filePath, options);
}
