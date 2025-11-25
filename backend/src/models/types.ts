// Core data model types for Firestore and Pinecone

export type ContractStatus =
  | 'uploaded'
  | 'parsed'
  | 'embedded'
  | 'analyzing'
  | 'complete'
  | 'failed';

export type EmbeddingStatus = 'pending' | 'done' | 'failed';

export type AnalysisStatus = 'running' | 'complete' | 'failed';

export type ProvisionPriority = 'critical' | 'high' | 'medium' | 'low';

// Firestore: contracts/{contractId}
export interface Contract {
  userId: string;
  storagePath: string;
  filename: string;
  uploadedAt: Date;
  status: ContractStatus;
  pageCount?: number;
  chunkCount?: number;
  provisionCatalogVersion?: string;
  projectName?: string;
  gcName?: string;
  state?: string;
}

// Firestore: contracts/{contractId}/chunks/{chunkId}
export interface Chunk {
  chunkId: string;
  userId: string;
  contractId: string;
  pageStart: number;
  pageEnd: number;
  sectionPath: string | null;
  text: string;
  textHash: string;
  embeddingStatus: EmbeddingStatus;
}

// Firestore: contracts/{contractId}/analyses/{analysisId}
export interface Analysis {
  userId: string;
  contractId: string;
  startedAt: Date;
  completedAt?: Date;
  model: string;
  status: AnalysisStatus;
  summaryCounts?: {
    criticalMatched: number;
    highMatched: number;
    mediumMatched: number;
    lowMatched: number;
  };
}

// Firestore: contracts/{contractId}/analyses/{analysisId}/findings/{provisionId}
export interface Finding {
  provisionId: string;
  priority: ProvisionPriority;
  matched: boolean;
  confidence: number;
  evidenceChunkIds: string[];
  evidencePages: number[];
  evidenceExcerpts: string[];
  reasoningSummary: string;
  recommendedAction?: string;
  createdAt: Date;
}

// Pinecone vector metadata
export interface PineconeMetadata {
  userId: string;
  contractId: string;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  sectionPath: string;
  textPreview: string;
}

// Provision catalog entry
export interface Provision {
  provisionId: string;
  priority: ProvisionPriority;
  canonicalWording: string;
  synonyms: string[];
  definition: string;
  falsePositiveTraps: string[];
  confidenceRubric: {
    explicit: string;
    strongParaphrase: string;
    weak: string;
  };
}

// Tool responses
export interface SearchChunksResult {
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  score: number;
  textPreview: string;
}

export interface GetChunkResult {
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  sectionPath: string | null;
  text: string;
}

export interface ExactFindMatch {
  chunkId: string;
  page: number;
  snippet: string;
  pattern: string;
}

export interface ExactFindResult {
  matches: ExactFindMatch[];
}
