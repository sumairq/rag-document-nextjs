import { createGeminiProvider } from "./gemini";
import type { AIProvider } from "./types";

export type { AIProvider, EmbeddingProvider, LLMProvider } from "./types";

/**
 * Returns the configured AI provider based on the `AI_PROVIDER` env var.
 *
 * To add OpenAI: create `./openai.ts` exporting a `createOpenAIProvider()`
 * that returns an `AIProvider`, then add a `case "openai"` below. Nothing
 * else in the app needs to change.
 */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "gemini";

  switch (provider) {
    case "gemini":
      return createGeminiProvider({
        apiKey: process.env.GEMINI_API_KEY ?? "",
        embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-004",
        generationModel: process.env.GENERATION_MODEL ?? "gemini-2.0-flash",
      });
    default:
      throw new Error(`Unknown AI_PROVIDER: "${provider}".`);
  }
}
