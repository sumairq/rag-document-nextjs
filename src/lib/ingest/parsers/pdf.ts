import { extractText, getDocumentProxy } from "unpdf";

import type { DocumentParser, ParsedPage } from "./types";

/** Joins pages with a blank line so chunk boundaries don't fuse two pages. */
const PAGE_SEPARATOR = "\n\n";

/**
 * PDF parser built on `unpdf` (a serverless-friendly pdf.js wrapper). We extract
 * text per page (`mergePages: false`) so we can record page boundaries — that's
 * what lets a chunk later cite the page it came from.
 */
export const pdfParser: DocumentParser = {
  extensions: [".pdf"],
  mimeTypes: ["application/pdf"],

  async parse(buffer) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: pageTexts } = await extractText(pdf, { mergePages: false });

    const pages: ParsedPage[] = [];
    let text = "";

    pageTexts.forEach((pageText, index) => {
      const charStart = text.length;
      text += pageText;
      pages.push({ pageNumber: index + 1, charStart, charEnd: text.length });
      // Separator chars sit between pages and belong to no page.
      if (index < pageTexts.length - 1) text += PAGE_SEPARATOR;
    });

    return { text, pages };
  },
};
