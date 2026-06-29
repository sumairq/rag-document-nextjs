/**
 * Provider-agnostic AI interfaces.
 *
 * The rest of the app depends only on these types — never on a concrete SDK.
 * To add a new provider (e.g. OpenAI), implement `AIProvider` in a new file
 * and wire it into the factory in `./index.ts`. No other code changes.
 */

/** How an embedded text will be used, so providers can specialize the vector. */
export type EmbedTaskType = "document" | "query";

export interface EmbedOptions {
  /**
   * "document" for text being stored/indexed, "query" for a user's search.
   * Some providers (Gemini) produce better retrieval results when told which.
   * Defaults to "document".
   */
  taskType?: EmbedTaskType;
}

export interface EmbeddingProvider {
  /** Model identifier, for logging/observability. */
  readonly model: string;
  /** Vector dimension this model emits. Must match the DB `vector(N)` column. */
  readonly dimensions: number;
  /**
   * Embed one or more texts. Returns one vector per input, in the same order.
   */
  embed(texts: string[], options?: EmbedOptions): Promise<number[][]>;
}

export interface GenerateOptions {
  /** System instruction / persona for the model. */
  system?: string;
  /** Sampling temperature (0 = deterministic). */
  temperature?: number;
  /** Hard cap on generated tokens. */
  maxOutputTokens?: number;
}

export interface LLMProvider {
  /** Model identifier, for logging/observability. */
  readonly model: string;
  /** Generate a single text completion for the given prompt. */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
}

/** Bundle of the two capabilities the app needs. */
export interface AIProvider {
  embeddings: EmbeddingProvider;
  llm: LLMProvider;
}
