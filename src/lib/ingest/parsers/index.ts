import { extname } from "node:path";

import { docxParser } from "./docx";
import { pdfParser } from "./pdf";
import { txtParser } from "./txt";
import type { DocumentParser } from "./types";

export type { DocumentParser, ParsedDocument, ParsedPage } from "./types";

/** Registry of available parsers. Add a new format by adding its module here. */
const PARSERS: readonly DocumentParser[] = [pdfParser, docxParser, txtParser];

/** Result of resolving a filename to the parser that handles it. */
export interface ResolvedParser {
  parser: DocumentParser;
  /** Canonical MIME type to record on the document. */
  mimeType: string;
  /** Lowercased extension (incl. dot). */
  extension: string;
}

/**
 * Picks a parser by file extension. Returns undefined for unsupported types so
 * callers can give a clear error listing what's allowed.
 */
export function resolveParser(filename: string): ResolvedParser | undefined {
  const extension = extname(filename).toLowerCase();
  const parser = PARSERS.find((p) => p.extensions.includes(extension));
  if (!parser) return undefined;
  return { parser, mimeType: parser.mimeTypes[0], extension };
}

/** Human-readable list of supported extensions, for error messages. */
export function supportedExtensions(): string[] {
  return PARSERS.flatMap((p) => [...p.extensions]);
}
