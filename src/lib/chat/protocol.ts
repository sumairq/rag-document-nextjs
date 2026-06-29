/**
 * Wire protocol for the chat stream. Pure types + constants only (no server or
 * DB imports) so both the API route and the client component can import it.
 *
 * The route streams newline-delimited JSON (NDJSON): one JSON object per line.
 * The client reads the stream, splits on "\n", and parses each line as a
 * `ChatStreamEvent`.
 */

/** A cited source, shaped for display (includes a text snippet). */
export interface CitationPayload {
  /** The [n] marker the model used. */
  marker: number;
  documentId: string;
  documentTitle: string;
  documentFilename: string;
  chunkId: string;
  chunkIndex: number;
  page: number | null;
  similarity: number;
  /** Short preview of the cited chunk's text. */
  snippet: string;
}

export type ChatStreamEvent =
  | { type: "token"; value: string }
  | { type: "done"; answerable: boolean; citations: CitationPayload[] }
  | { type: "error"; message: string };

/** Content-Type used by the streaming route. */
export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
