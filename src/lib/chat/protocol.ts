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
  /** Verbatim span the model cited — the relevant passage to highlight. */
  quote: string;
}

export type ChatStreamEvent =
  | { type: "token"; value: string }
  | {
      type: "done";
      answerable: boolean;
      citations: CitationPayload[];
      /** The thread this answer was saved to (created on the first turn). */
      conversationId: string;
      /** The thread's title (auto-generated on the first turn). */
      title: string;
    }
  | { type: "error"; message: string };

/** A persisted conversation, shaped for the client (dates as ISO strings). */
export interface ConversationSummary {
  id: string;
  collectionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** A persisted message, shaped for the client. Citations re-hydrate assistant
 * answers with their sources on reload; null for user turns. */
export interface ChatMessagePayload {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: CitationPayload[] | null;
  createdAt: string;
}

/** A conversation plus its messages, as returned to the client on restore. */
export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ChatMessagePayload[];
}

/** Content-Type used by the streaming route. */
export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/** Collection as returned by GET /api/collections (client-facing shape). */
export interface CollectionSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSample: boolean;
  documentCount: number;
  createdAt: string;
}

/** Document as returned by GET /api/documents (client-facing shape). */
export interface DocumentSummary {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: string;
  chunkCount: number;
  error: string | null;
  createdAt: string;
}

/**
 * A resolved citation source: the cited chunk's text, framed by overlap-free
 * context from its neighboring chunks. `before`/`highlight`/`after` concatenate
 * into a continuous excerpt of the document, with `highlight` being the exact
 * cited chunk.
 */
export interface SourceResolution {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentFilename: string;
  chunkIndex: number;
  page: number | null;
  /** Preceding context (from the previous chunk), overlap removed. */
  before: string;
  /** The cited chunk's full text — the passage to highlight. */
  highlight: string;
  /** Following context (from the next chunk), overlap removed. */
  after: string;
}
