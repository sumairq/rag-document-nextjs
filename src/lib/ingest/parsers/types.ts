/**
 * Common interface every document parser implements. A parser's only job is to
 * turn raw file bytes into plain text (plus optional page boundaries) — it does
 * NOT chunk or embed. This keeps each format isolated and swappable.
 */

/** A page's span within the parsed `text`, for formats that have pages (PDF). */
export interface ParsedPage {
  /** 1-based page number. */
  pageNumber: number;
  /** Char offset (inclusive) where this page begins in `ParsedDocument.text`. */
  charStart: number;
  /** Char offset (exclusive) where this page ends. */
  charEnd: number;
}

export interface ParsedDocument {
  /** Full extracted plain text — the input to chunking. */
  text: string;
  /**
   * Page boundaries, if the format has them (PDF). Lets the chunker attribute
   * each chunk to a source page for citations. Undefined for page-less formats
   * (TXT/DOCX), in which case chunks get a null page.
   */
  pages?: ParsedPage[];
}

export interface DocumentParser {
  /** Lowercased extensions handled, including the dot (e.g. ".pdf"). */
  readonly extensions: readonly string[];
  /** MIME types handled. */
  readonly mimeTypes: readonly string[];
  /** Parse raw bytes into plain text. */
  parse(buffer: Buffer): Promise<ParsedDocument>;
}
