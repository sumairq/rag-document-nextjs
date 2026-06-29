import mammoth from "mammoth";

import type { DocumentParser } from "./types";

/**
 * DOCX parser using `mammoth`'s raw-text extraction. DOCX has no reliable page
 * model (pagination is computed by the renderer, not stored), so we emit no
 * page boundaries — chunks from DOCX get a null page.
 */
export const docxParser: DocumentParser = {
  extensions: [".docx"],
  mimeTypes: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],

  async parse(buffer) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value };
  },
};
