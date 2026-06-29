import type { DocumentParser } from "./types";

/**
 * Plain-text parser. Also handles Markdown — we treat it as text for now
 * (no structure-aware splitting yet). No pages.
 */
export const txtParser: DocumentParser = {
  extensions: [".txt", ".md", ".markdown"],
  mimeTypes: ["text/plain", "text/markdown"],

  async parse(buffer) {
    return { text: buffer.toString("utf-8") };
  },
};
