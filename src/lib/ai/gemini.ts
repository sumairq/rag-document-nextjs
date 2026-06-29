import { GoogleGenAI } from "@google/genai";

import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type {
  AIProvider,
  EmbedOptions,
  EmbeddingProvider,
  GenerateOptions,
  LLMProvider,
} from "./types";

// Maps our task-type hint to Gemini's embedding task types.
const TASK_TYPE: Record<NonNullable<EmbedOptions["taskType"]>, string> = {
  document: "RETRIEVAL_DOCUMENT",
  query: "RETRIEVAL_QUERY",
};

export interface GeminiProviderConfig {
  apiKey: string;
  embeddingModel: string;
  generationModel: string;
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly client: GoogleGenAI,
    readonly model: string,
  ) {}

  async embed(texts: string[], options?: EmbedOptions): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.client.models.embedContent({
      model: this.model,
      contents: texts,
      config: {
        taskType: TASK_TYPE[options?.taskType ?? "document"],
        outputDimensionality: this.dimensions,
      },
    });

    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(
        `Gemini returned ${embeddings.length} embeddings for ${texts.length} inputs.`,
      );
    }

    return embeddings.map((embedding, i) => {
      const values = embedding.values;
      if (!values || values.length !== this.dimensions) {
        throw new Error(
          `Embedding ${i} has ${values?.length ?? 0} dims, expected ${this.dimensions}.`,
        );
      }
      return values;
    });
  }
}

class GeminiLLMProvider implements LLMProvider {
  constructor(
    private readonly client: GoogleGenAI,
    readonly model: string,
  ) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: options?.system,
        temperature: options?.temperature,
        maxOutputTokens: options?.maxOutputTokens,
        responseMimeType: options?.json ? "application/json" : undefined,
      },
    });

    return response.text ?? "";
  }
}

export function createGeminiProvider(
  config: GeminiProviderConfig,
): AIProvider {
  if (!config.apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  return {
    embeddings: new GeminiEmbeddingProvider(client, config.embeddingModel),
    llm: new GeminiLLMProvider(client, config.generationModel),
  };
}
