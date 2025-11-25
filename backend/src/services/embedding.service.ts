import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  // OpenAI allows batch embedding requests
  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}
