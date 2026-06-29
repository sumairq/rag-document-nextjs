/**
 * Per-collection "try asking…" starter questions for the chat empty state,
 * keyed by collection slug. Verified against the seeded sample content.
 *
 * The company-policies entry is an intentional "not in the documents" example:
 * the corpus only contains remote-work and data-retention policies, so it
 * demonstrates the honest refusal (no fabricated citation).
 */
export const STARTER_PROMPTS: Record<string, string[]> = {
  "product-manual": [
    "How do I factory reset the SmartHub, and what does it erase?",
    "Why do my accessories keep going offline?",
  ],
  "research-papers": [
    "What's the difference between HNSW and IVFFlat?",
    "Why does the Transformer use positional encoding?",
  ],
  "company-policies": [
    // Intentional not-in-docs demo → honest "not in the documents" answer.
    "What's the parental leave policy?",
    "How many days a week can I work remotely?",
  ],
};

export function startersFor(slug: string | undefined): string[] {
  return slug ? (STARTER_PROMPTS[slug] ?? []) : [];
}
