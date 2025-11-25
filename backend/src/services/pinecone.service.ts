import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config';
import type { PineconeMetadata, SearchChunksResult } from '../models/types';

let pinecone: Pinecone;
let index: any;

export async function initializePinecone() {
  pinecone = new Pinecone({
    apiKey: config.pinecone.apiKey,
  });

  index = pinecone.index(config.pinecone.indexName);
  console.log(`Pinecone initialized with index: ${config.pinecone.indexName}`);
}

export async function upsertVector(
  chunkId: string,
  embedding: number[],
  metadata: PineconeMetadata
): Promise<void> {
  if (!index) throw new Error('Pinecone not initialized');

  await index.upsert([
    {
      id: chunkId,
      values: embedding,
      metadata,
    },
  ]);
}

export async function upsertVectorsBatch(
  vectors: Array<{
    chunkId: string;
    embedding: number[];
    metadata: PineconeMetadata;
  }>
): Promise<void> {
  if (!index) throw new Error('Pinecone not initialized');

  const records = vectors.map((v) => ({
    id: v.chunkId,
    values: v.embedding,
    metadata: v.metadata,
  }));

  // Pinecone recommends batches of 100
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await index.upsert(batch);
  }
}

export async function searchVectors(
  queryEmbedding: number[],
  userId: string,
  contractId: string,
  topK: number = 8
): Promise<SearchChunksResult[]> {
  if (!index) throw new Error('Pinecone not initialized');

  const queryResponse = await index.query({
    vector: queryEmbedding,
    filter: {
      userId: { $eq: userId },
      contractId: { $eq: contractId },
    },
    topK,
    includeMetadata: true,
  });

  return (queryResponse.matches || []).map((match: any) => ({
    chunkId: match.id,
    pageStart: match.metadata.pageStart,
    pageEnd: match.metadata.pageEnd,
    score: match.score,
    textPreview: match.metadata.textPreview,
  }));
}

export async function deleteVectorsByContract(
  userId: string,
  contractId: string
): Promise<void> {
  if (!index) throw new Error('Pinecone not initialized');

  await index.deleteMany({
    filter: {
      userId: { $eq: userId },
      contractId: { $eq: contractId },
    },
  });
}

export async function getVectorById(chunkId: string): Promise<any> {
  if (!index) throw new Error('Pinecone not initialized');

  const response = await index.fetch([chunkId]);
  return response.records?.[chunkId];
}

export async function deleteVectorsByIds(chunkIds: string[]): Promise<void> {
  if (!index) throw new Error('Pinecone not initialized');

  // Delete in batches of 1000 (Pinecone limit)
  const batchSize = 1000;
  for (let i = 0; i < chunkIds.length; i += batchSize) {
    const batch = chunkIds.slice(i, i + batchSize);
    await index.deleteMany(batch);
  }
}
