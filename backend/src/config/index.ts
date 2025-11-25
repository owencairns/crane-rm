import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  },

  pinecone: {
    apiKey: process.env.PINECONE_API_KEY!,
    indexName: process.env.PINECONE_INDEX_NAME || 'certmaster-contracts',
    environment: process.env.PINECONE_ENVIRONMENT,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    embeddingModel: 'text-embedding-3-small',
    analysisModel: 'gpt-4o-mini', // Using GPT-4o mini as specified
  },

  // Chunk settings
  chunking: {
    maxTokens: 7500, // Keep below 8192 token limit for text-embedding-3-small
    overlapTokens: 200,
  },

  // Retrieval settings
  retrieval: {
    topK: 8,
    minScore: 0.5,
  },

  // Provision catalog version
  catalogVersion: '1.0.0',
};

// Validate required config
const requiredVars = [
  'PINECONE_API_KEY',
  'OPENAI_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_STORAGE_BUCKET',
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
