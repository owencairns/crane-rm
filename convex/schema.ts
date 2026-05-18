import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const analysisSummaryCounts = v.object({
  criticalMatched: v.number(),
  highMatched: v.number(),
  mediumMatched: v.number(),
  lowMatched: v.number(),
});

const analysisError = v.object({
  message: v.string(),
  code: v.optional(v.string()),
  batchesFailed: v.optional(v.number()),
  batchesSucceeded: v.optional(v.number()),
  failedProvisionIds: v.optional(v.array(v.string())),
});

export default defineSchema({
  contracts: defineTable({
    ownerId: v.string(),
    filename: v.string(),
    status: v.string(),
    storageId: v.optional(v.id("_storage")),
    pageCount: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    provisionCatalogVersion: v.optional(v.string()),
    projectName: v.optional(v.string()),
    gcName: v.optional(v.string()),
    state: v.optional(v.string()),
    riskScore: v.optional(v.number()),
    lastAnalysisId: v.optional(v.id("analyses")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  chunks: defineTable({
    ownerId: v.string(),
    contractId: v.id("contracts"),
    chunkId: v.string(),
    chunkIndex: v.number(),
    pageStart: v.number(),
    pageEnd: v.number(),
    sectionPath: v.optional(v.string()),
    text: v.string(),
    textHash: v.string(),
  })
    .index("by_contract", ["contractId"])
    .index("by_chunk_id", ["chunkId"]),

  contract_images: defineTable({
    contractId: v.id("contracts"),
    imageIndex: v.number(),
    storageId: v.id("_storage"),
    pageNumber: v.number(),
    altText: v.string(),
  })
    .index("by_contract", ["contractId"])
    .index("by_contract_image", ["contractId", "imageIndex"]),

  analyses: defineTable({
    ownerId: v.string(),
    contractId: v.id("contracts"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    model: v.string(),
    status: v.string(),
    summaryCounts: v.optional(analysisSummaryCounts),
    error: v.optional(analysisError),
  })
    .index("by_contract", ["contractId"])
    .index("by_owner", ["ownerId"]),

  findings: defineTable({
    ownerId: v.string(),
    contractId: v.id("contracts"),
    analysisId: v.id("analyses"),
    provisionId: v.string(),
    priority: v.string(),
    matched: v.boolean(),
    confidence: v.number(),
    evidenceChunkIds: v.array(v.string()),
    evidencePages: v.array(v.number()),
    evidenceExcerpts: v.array(v.string()),
    reasoningSummary: v.string(),
    recommendedAction: v.optional(v.string()),
    screeningResult: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_analysis", ["analysisId"])
    .index("by_contract", ["contractId"])
    .index("by_analysis_provision", ["analysisId", "provisionId"]),
});
