import type { Id } from "../_generated/dataModel";

export type ContractStatus =
  | "draft"
  | "uploaded"
  | "parsing"
  | "analyzing"
  | "complete"
  | "failed";

export type AnalysisStatus = "running" | "complete" | "partial" | "failed";
export type ProvisionPriority = "critical" | "high" | "medium" | "low";

export interface ContractRecord {
  _id: Id<"contracts">;
  ownerId: string;
  filename: string;
  status: ContractStatus;
  storageId?: Id<"_storage">;
  pageCount?: number;
  chunkCount?: number;
  provisionCatalogVersion?: string;
  projectName?: string;
  gcName?: string;
  state?: string;
  riskScore?: number;
  lastAnalysisId?: Id<"analyses">;
  createdAt: number;
  updatedAt: number;
}

export interface ChunkRecord {
  _id?: Id<"chunks">;
  ownerId: string;
  contractId: Id<"contracts">;
  chunkId: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  sectionPath?: string;
  text: string;
  textHash: string;
}

export interface ContractImageRecord {
  _id?: Id<"contract_images">;
  contractId: Id<"contracts">;
  imageIndex: number;
  storageId: Id<"_storage">;
  pageNumber: number;
  altText: string;
}

export interface AnalysisRecord {
  _id?: Id<"analyses">;
  ownerId: string;
  contractId: Id<"contracts">;
  startedAt: number;
  completedAt?: number;
  model: string;
  status: AnalysisStatus;
  summaryCounts?: {
    criticalMatched: number;
    highMatched: number;
    mediumMatched: number;
    lowMatched: number;
  };
  error?: {
    message: string;
    code?: string;
    batchesFailed?: number;
    batchesSucceeded?: number;
    failedProvisionIds?: string[];
  };
}

export type ScreeningResult =
  | "no_candidates"
  | "analyzed_not_found"
  | "analyzed_found"
  | "not_analyzed"
  | "error";

export interface FindingRecord {
  provisionId: string;
  priority: ProvisionPriority;
  matched: boolean;
  confidence: number;
  evidenceChunkIds: string[];
  evidencePages: number[];
  evidenceExcerpts: string[];
  reasoningSummary: string;
  recommendedAction?: string;
  screeningResult?: ScreeningResult;
  createdAt: number;
}

export interface ParsedBlock {
  text: string;
  pageNumber: number;
}

export interface OcrPage {
  pageNumber: number;
  markdown: string;
  images: Array<{ url: string; altText: string }>;
}

export interface OcrResult {
  pages: OcrPage[];
  pageCount: number;
  rawMarkdown: string;
}

export interface ChunkData {
  text: string;
  pageStart: number;
  pageEnd: number;
  sectionPath?: string;
  textHash: string;
  imageRefs: Array<{ imageIndex: number; altText: string; pageNumber: number }>;
}


export interface Provision {
  provisionId: string;
  priority: ProvisionPriority;
  canonicalWording: string;
  synonyms: string[];
  definition: string;
  suggestedAction?: string;
  falsePositiveTraps: string[];
  confidenceRubric: {
    explicit: string;
    strongParaphrase: string;
    weak: string;
  };
  searchQueries?: string[];
  exactPatterns?: string[];
  clusterId?: string;
}
