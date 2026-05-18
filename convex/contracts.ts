import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getProvisionById } from "./lib/provisions";
import type { ChunkRecord, ContractRecord, FindingRecord } from "./lib/types";

function formatContractDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US").format(new Date(timestamp));
}

async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  return identity.subject;
}

function toContractListItem(contract: Doc<"contracts">) {
  return {
    id: contract._id,
    name: contract.filename,
    client: contract.gcName || "Unknown Client",
    date: formatContractDate(contract.createdAt),
    status: contract.status,
    riskScore: contract.riskScore,
  };
}

function calculateRiskScore(findings: FindingRecord[]): number {
  if (findings.length === 0) {
    return 0;
  }

  const notFoundFindings = findings.filter((finding) => !finding.matched);
  if (notFoundFindings.length === 0) {
    return 0;
  }

  const severityWeights: Record<string, number> = {
    critical: 30,
    high: 20,
    medium: 10,
    low: 5,
  };

  const totalScore = notFoundFindings.reduce((sum, finding) => {
    return sum + (severityWeights[finding.priority] || 0);
  }, 0);

  return Math.min(100, totalScore);
}

/* ------------------------------------------------------------------ */
/*  Public queries                                                    */
/* ------------------------------------------------------------------ */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_owner", (queryBuilder) => queryBuilder.eq("ownerId", ownerId))
      .collect();

    return contracts
      .filter((contract) => contract.status !== "draft")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toContractListItem);
  },
});

export const get = query({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    const ownerId = await requireUserId(ctx);
    const contract = await ctx.db.get(contractId);
    if (!contract || contract.ownerId !== ownerId || contract.status === "draft") {
      return null;
    }

    return {
      id: contract._id,
      name: contract.filename,
      client: contract.gcName || "Unknown Client",
      date: formatContractDate(contract.createdAt),
      status: contract.status,
      riskScore: contract.riskScore,
      projectName: contract.projectName,
      state: contract.state,
    };
  },
});

export const requestUpload = mutation({
  args: {
    fileName: v.string(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, { fileName }) => {
    const ownerId = await requireUserId(ctx);
    const now = Date.now();
    const uploadUrl = await ctx.storage.generateUploadUrl();
    const contractId = await ctx.db.insert("contracts", {
      ownerId,
      filename: fileName,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    return {
      contractId,
      uploadUrl,
    };
  },
});

export const startProcessing = mutation({
  args: {
    contractId: v.id("contracts"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { contractId, storageId }) => {
    const ownerId = await requireUserId(ctx);
    const contract = await ctx.db.get(contractId);

    if (!contract || contract.ownerId !== ownerId) {
      throw new ConvexError("Contract not found");
    }

    await ctx.db.patch(contractId, {
      storageId,
      status: "uploaded",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.contractNode.ingestContract, {
      contractId,
      ownerId,
    });

    return {
      contractId,
      status: "queued",
    };
  },
});

export const reprocessContract = mutation({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    const ownerId = await requireUserId(ctx);
    const contract = await ctx.db.get(contractId);

    if (!contract || contract.ownerId !== ownerId) {
      throw new ConvexError("Contract not found");
    }

    if (contract.status !== "failed") {
      throw new ConvexError("Only failed contracts can be reprocessed");
    }

    if (!contract.storageId) {
      throw new ConvexError("Cannot reprocess — original file not found in storage");
    }

    await ctx.db.patch(contractId, {
      status: "uploaded",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.contractNode.ingestContract, {
      contractId,
      ownerId,
    });

    return { contractId, status: "queued" };
  },
});

export const getPdfUrl = query({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    const ownerId = await requireUserId(ctx);
    const contract = await ctx.db.get(contractId);
    if (!contract || contract.ownerId !== ownerId || !contract.storageId) {
      return null;
    }

    const url = await ctx.storage.getUrl(contract.storageId);
    return url ? { url } : null;
  },
});

export const getResults = query({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    const ownerId = await requireUserId(ctx);
    const contract = await ctx.db.get(contractId);
    if (!contract || contract.ownerId !== ownerId) {
      return null;
    }

    if (!contract.lastAnalysisId) {
      return null;
    }

    const analysis = await ctx.db.get(contract.lastAnalysisId);
    if (!analysis) {
      return null;
    }

    const findings = await ctx.db
      .query("findings")
      .withIndex("by_analysis", (queryBuilder) => queryBuilder.eq("analysisId", contract.lastAnalysisId!))
      .collect();

    const matchedCount = findings.filter((finding) => finding.matched).length;
    const notFoundCount = findings.length - matchedCount;
    const riskScore = contract.riskScore ?? calculateRiskScore(findings as FindingRecord[]);

    return {
      contractId,
      jobId: analysis._id,
      status: analysis.status,
      summary: `Analysis complete: ${matchedCount} provisions found, ${notFoundCount} not found.`,
      findings: findings.map((finding) => {
        const provision = getProvisionById(finding.provisionId);
        return {
          id: finding.provisionId,
          priority: finding.priority,
          matched: finding.matched,
          confidence: finding.confidence,
          category: finding.priority,
          title:
            provision?.canonicalWording ||
            finding.provisionId
              .split("-")
              .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
              .join(" "),
          description: finding.reasoningSummary,
          pageReferences: finding.evidencePages,
          evidenceExcerpts: finding.evidenceExcerpts,
          recommendation: finding.recommendedAction,
          suggestedAction: finding.matched ? provision?.suggestedAction : undefined,
          screeningResult: finding.screeningResult,
        };
      }),
      riskScore,
      completedAt: analysis.completedAt,
      error: analysis.error,
    };
  },
});

/* ------------------------------------------------------------------ */
/*  Internal queries                                                  */
/* ------------------------------------------------------------------ */

export const getContractRecord = internalQuery({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    return (await ctx.db.get(contractId)) as ContractRecord | null;
  },
});

export const getAllChunksForContract = internalQuery({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    return (await ctx.db
      .query("chunks")
      .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contractId))
      .collect()) as ChunkRecord[];
  },
});

export const getChunkByChunkId = internalQuery({
  args: {
    chunkId: v.string(),
  },
  handler: async (ctx, { chunkId }) => {
    return (await ctx.db
      .query("chunks")
      .withIndex("by_chunk_id", (queryBuilder) => queryBuilder.eq("chunkId", chunkId))
      .unique()) as ChunkRecord | null;
  },
});

export const getAdjacentChunks = internalQuery({
  args: {
    contractId: v.id("contracts"),
    chunkId: v.string(),
    window: v.optional(v.number()),
  },
  handler: async (ctx, { contractId, chunkId, window = 1 }) => {
    const match = chunkId.match(/_chunk_(\d+)$/);
    if (!match) {
      return [];
    }

    const currentNum = Number.parseInt(match[1], 10);
    const allChunks = await ctx.db
      .query("chunks")
      .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contractId))
      .collect();

    const lowerBound = Math.max(0, currentNum - window);
    const upperBound = currentNum + window;

    return allChunks
      .filter((chunk) => chunk.chunkIndex >= lowerBound && chunk.chunkIndex <= upperBound && chunk.chunkId !== chunkId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex) as ChunkRecord[];
  },
});

export const getUserContractsWithChunks = internalQuery({
  args: {
    ownerId: v.string(),
  },
  handler: async (ctx, { ownerId }) => {
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_owner", (queryBuilder) => queryBuilder.eq("ownerId", ownerId))
      .collect();

    const results: Array<{ contract: ContractRecord; chunks: ChunkRecord[] }> = [];
    for (const contract of contracts) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contract._id))
        .collect();

      results.push({
        contract: contract as ContractRecord,
        chunks: chunks as ChunkRecord[],
      });
    }

    return results;
  },
});

export const getImageByIndex = internalQuery({
  args: {
    contractId: v.id("contracts"),
    imageIndex: v.number(),
  },
  handler: async (ctx, { contractId, imageIndex }) => {
    const image = await ctx.db
      .query("contract_images")
      .withIndex("by_contract_image", (queryBuilder) =>
        queryBuilder.eq("contractId", contractId).eq("imageIndex", imageIndex)
      )
      .unique();

    if (!image) {
      return null;
    }

    const url = await ctx.storage.getUrl(image.storageId);
    return {
      imageIndex: image.imageIndex,
      pageNumber: image.pageNumber,
      altText: image.altText,
      url,
    };
  },
});

export const getImagesForContract = internalQuery({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    return await ctx.db
      .query("contract_images")
      .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contractId))
      .collect();
  },
});

/* ------------------------------------------------------------------ */
/*  Internal mutations                                                */
/* ------------------------------------------------------------------ */

export const createAnalysis = internalMutation({
  args: {
    contractId: v.id("contracts"),
    ownerId: v.string(),
    model: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, { contractId, ownerId, model, startedAt }) => {
    const analysisId = await ctx.db.insert("analyses", {
      ownerId,
      contractId,
      model,
      status: "running",
      startedAt,
    });

    await ctx.db.patch(contractId, {
      lastAnalysisId: analysisId,
      updatedAt: Date.now(),
    });

    return analysisId;
  },
});

export const patchContract = internalMutation({
  args: {
    contractId: v.id("contracts"),
    patch: v.any(),
  },
  handler: async (ctx, { contractId, patch }) => {
    await ctx.db.patch(contractId, patch);
  },
});

export const patchAnalysis = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    patch: v.any(),
  },
  handler: async (ctx, { analysisId, patch }) => {
    await ctx.db.patch(analysisId, patch);
  },
});

export const insertChunks = internalMutation({
  args: {
    chunks: v.any(),
  },
  handler: async (ctx, { chunks }) => {
    for (const chunk of chunks as ChunkRecord[]) {
      await ctx.db.insert("chunks", chunk);
    }
  },
});

export const insertImages = internalMutation({
  args: {
    images: v.any(),
  },
  handler: async (ctx, { images }) => {
    for (const image of images as Array<{
      contractId: string;
      imageIndex: number;
      storageId: string;
      pageNumber: number;
      altText: string;
    }>) {
      await ctx.db.insert("contract_images", image as any);
    }
  },
});

export const upsertFindings = internalMutation({
  args: {
    contractId: v.id("contracts"),
    analysisId: v.id("analyses"),
    ownerId: v.string(),
    findings: v.any(),
  },
  handler: async (ctx, { contractId, analysisId, ownerId, findings }) => {
    for (const finding of findings as FindingRecord[]) {
      const existing = await ctx.db
        .query("findings")
        .withIndex("by_analysis_provision", (queryBuilder) =>
          queryBuilder.eq("analysisId", analysisId).eq("provisionId", finding.provisionId)
        )
        .unique();

      const document = {
        ownerId,
        contractId,
        analysisId,
        ...finding,
      };

      if (existing) {
        await ctx.db.patch(existing._id, document);
      } else {
        await ctx.db.insert("findings", document);
      }
    }
  },
});

export const getFindingsForAnalysis = internalQuery({
  args: {
    analysisId: v.id("analyses"),
  },
  handler: async (ctx, { analysisId }) => {
    return (await ctx.db
      .query("findings")
      .withIndex("by_analysis", (queryBuilder) => queryBuilder.eq("analysisId", analysisId))
      .collect()) as FindingRecord[];
  },
});

export const deleteContractGraph = internalMutation({
  args: {
    contractId: v.id("contracts"),
  },
  handler: async (ctx, { contractId }) => {
    // Delete chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contractId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete images (storage blobs + records)
    const images = await ctx.db
      .query("contract_images")
      .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contractId))
      .collect();
    for (const image of images) {
      await ctx.storage.delete(image.storageId);
      await ctx.db.delete(image._id);
    }

    // Delete analyses + findings
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_contract", (queryBuilder) => queryBuilder.eq("contractId", contractId))
      .collect();

    for (const analysis of analyses) {
      const findings = await ctx.db
        .query("findings")
        .withIndex("by_analysis", (queryBuilder) => queryBuilder.eq("analysisId", analysis._id))
        .collect();
      for (const finding of findings) {
        await ctx.db.delete(finding._id);
      }
      await ctx.db.delete(analysis._id);
    }

    await ctx.db.delete(contractId);
  },
});
