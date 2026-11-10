import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireActiveAccess, requireAuditGuardEnabled } from "./lib/access";

/* ------------------------------------------------------------------ */
/*  AuditGuard — premium-audit estimation                             */
/*                                                                    */
/*  Two-stage flow:                                                   */
/*   1. requestReview + startReview → OCR/extract the policy package,  */
/*      derive the dynamic financial-input checklist, pause at         */
/*      "awaiting_inputs".                                            */
/*   2. submitInputs → run the deterministic estimate, write one       */
/*      auditGuardLine per rated line of business, mark "complete".    */
/* ------------------------------------------------------------------ */

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US").format(new Date(timestamp));
}

async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  return identity.subject;
}

function toReviewListItem(review: Doc<"auditGuardReviews">) {
  const displayFile =
    review.policyFilenames.length === 1
      ? review.policyFilenames[0]
      : `${review.policyFilenames[0]} + ${review.policyFilenames.length - 1} more`;
  return {
    id: review._id,
    clientName: review.clientName || displayFile,
    policyFilename: displayFile,
    policyFilenames: review.policyFilenames,
    status: review.status,
    date: formatDate(review.createdAt),
    estimateSummary: review.estimateSummary,
  };
}

/* ------------------------------------------------------------------ */
/*  Public queries                                                    */
/* ------------------------------------------------------------------ */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const reviews = await ctx.db
      .query("auditGuardReviews")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    return reviews
      .filter((review) => review.status !== "draft")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toReviewListItem);
  },
});

export const get = query({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId || review.status === "draft") {
      return null;
    }
    return {
      id: review._id,
      clientName: review.clientName,
      policyFilenames: review.policyFilenames,
      status: review.status,
      date: formatDate(review.createdAt),
      estimateSummary: review.estimateSummary,
      errorMessage: review.errorMessage,
    };
  },
});

export const getResults = query({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      return null;
    }

    const lines = await ctx.db
      .query("auditGuardLines")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .collect();

    return {
      reviewId,
      status: review.status,
      clientName: review.clientName,
      policyFilenames: review.policyFilenames,
      estimateSummary: review.estimateSummary,
      errorMessage: review.errorMessage,
      completedAt: review.updatedAt,
      // Parsed back into the shapes the client renders.
      inputRequests: review.inputRequests
        ? JSON.parse(review.inputRequests)
        : [],
      financialInputs: review.financialInputs
        ? JSON.parse(review.financialInputs)
        : null,
      lines: lines
        .sort((a, b) => a.lineOfBusiness.localeCompare(b.lineOfBusiness))
        .map((line) => ({
          id: line.lineId,
          lineOfBusiness: line.lineOfBusiness,
          policyNumber: line.policyNumber,
          carrier: line.carrier,
          auditable: line.auditable,
          ratingBasis: line.ratingBasis,
          ratingBasisLabel: line.ratingBasisLabel,
          unitSize: line.unitSize,
          classCode: line.classCode,
          classCodeDescription: line.classCodeDescription,
          state: line.state,
          ratePerUnit: line.ratePerUnit,
          rateComponents: line.rateComponents,
          rateSource: line.rateSource,
          boundExposure: line.boundExposure,
          currentPremium: line.currentPremium,
          premiumModifiers: line.premiumModifiers,
          confidence: line.confidence,
          assumptions: line.assumptions ?? [],
          notes: line.notes,
          evidenceExcerpts: line.evidenceExcerpts ?? [],
          citations: line.citations ?? [],
          estimateStatus: line.estimateStatus,
          inputKey: line.inputKey,
          rawExposure: line.rawExposure,
          projectedExposure: line.projectedExposure,
          annualized: line.annualized ?? false,
          additionalExposure: line.additionalExposure,
          additionalPremium: line.additionalPremium,
          projectedPremium: line.projectedPremium,
          estimateReasoning: line.estimateReasoning,
        })),
    };
  },
});

export const getDocumentUrls = query({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId || review.status === "draft") {
      return null;
    }
    const storageIds = review.policyStorageIds ?? [];
    const policyDocuments = await Promise.all(
      storageIds.map(async (storageId, index) => ({
        filename: review.policyFilenames[index] ?? `Policy ${index + 1}`,
        url: await ctx.storage.getUrl(storageId),
      }))
    );
    return { policyDocuments };
  },
});

/* ------------------------------------------------------------------ */
/*  Public mutations                                                  */
/* ------------------------------------------------------------------ */

// Step 1: create a draft review + an upload URL per policy document.
export const requestReview = mutation({
  args: { policyFilenames: v.array(v.string()) },
  handler: async (ctx, { policyFilenames }) => {
    requireAuditGuardEnabled();
    await requireActiveAccess(ctx);
    const ownerId = await requireUserId(ctx);
    if (policyFilenames.length === 0) {
      throw new ConvexError("At least one policy PDF is required");
    }
    const now = Date.now();

    const policyUploadUrls = await Promise.all(
      policyFilenames.map(() => ctx.storage.generateUploadUrl())
    );

    const reviewId = await ctx.db.insert("auditGuardReviews", {
      ownerId,
      policyFilenames,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    return { reviewId, policyUploadUrls };
  },
});

// Step 2: policies uploaded — record storage ids and kick off ingest.
export const startReview = mutation({
  args: {
    reviewId: v.id("auditGuardReviews"),
    policyStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, { reviewId, policyStorageIds }) => {
    await requireActiveAccess(ctx);
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }
    if (policyStorageIds.length === 0) {
      throw new ConvexError("At least one policy PDF is required");
    }

    await ctx.db.patch(reviewId, {
      policyStorageIds,
      status: "uploaded",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditGuardNode.ingestPolicies, {
      reviewId,
      ownerId,
    });

    return { reviewId, status: "queued" };
  },
});

// Step 3: user supplies the requested financial figures → run the estimate.
export const submitInputs = mutation({
  args: {
    reviewId: v.id("auditGuardReviews"),
    // key -> dollar/count value, optionally annotated with its source period
    financialInputs: v.record(
      v.string(),
      v.union(
        v.number(),
        v.object({
          amount: v.number(),
          monthsCovered: v.optional(v.number()),
          periodStart: v.optional(v.union(v.string(), v.null())),
          periodEnd: v.optional(v.union(v.string(), v.null())),
        })
      )
    ),
  },
  handler: async (ctx, { reviewId, financialInputs }) => {
    await requireActiveAccess(ctx);
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }
    if (review.status !== "awaiting_inputs" && review.status !== "complete") {
      throw new ConvexError(
        "This review is not ready for financial inputs yet."
      );
    }

    await ctx.db.patch(reviewId, {
      financialInputs: JSON.stringify(financialInputs),
      status: "estimating",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.auditGuardNode.generateEstimate, {
      reviewId,
      ownerId,
    });

    return { reviewId, status: "estimating" };
  },
});

export const reprocessReview = mutation({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }
    if (review.status !== "failed") {
      throw new ConvexError("Only failed reviews can be reprocessed");
    }
    if (!review.policyStorageIds?.length) {
      throw new ConvexError("Cannot reprocess — original files not found");
    }

    await ctx.db.patch(reviewId, { status: "uploaded", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.auditGuardNode.ingestPolicies, {
      reviewId,
      ownerId,
    });
    return { reviewId, status: "queued" };
  },
});

export const deleteReview = mutation({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }

    for (const storageId of new Set(review.policyStorageIds ?? [])) {
      await ctx.storage.delete(storageId);
    }

    const lines = await ctx.db
      .query("auditGuardLines")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .collect();
    for (const line of lines) {
      await ctx.db.delete(line._id);
    }

    await ctx.db.delete(reviewId);
    return { reviewId, message: "Review deleted" };
  },
});

/* ------------------------------------------------------------------ */
/*  Internal queries / mutations (used by auditGuardNode action)       */
/* ------------------------------------------------------------------ */

export const getReviewRecord = internalQuery({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    return await ctx.db.get(reviewId);
  },
});

export const getReviewLines = internalQuery({
  args: { reviewId: v.id("auditGuardReviews") },
  handler: async (ctx, { reviewId }) => {
    return await ctx.db
      .query("auditGuardLines")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .collect();
  },
});

export const patchReview = internalMutation({
  args: { reviewId: v.id("auditGuardReviews"), patch: v.any() },
  handler: async (ctx, { reviewId, patch }) => {
    await ctx.db.patch(reviewId, patch);
  },
});

function normalizeRateComponents(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const components = value
    .map((component) => {
      if (!component || typeof component !== "object") return null;
      const c = component as Record<string, unknown>;
      const ratePerUnit = Number(c.ratePerUnit);
      if (!Number.isFinite(ratePerUnit)) return null;
      return {
        label: String(c.label ?? "Rate component"),
        ratePerUnit,
      };
    })
    .filter((component): component is { label: string; ratePerUnit: number } =>
      Boolean(component)
    );
  return components.length ? components : undefined;
}

function normalizePremiumModifiers(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const modifiers = value
    .map((modifier) => {
      if (!modifier || typeof modifier !== "object") return null;
      const m = modifier as Record<string, unknown>;
      const factor = Number(m.factor);
      if (!Number.isFinite(factor)) return null;
      return {
        key: String(m.key ?? m.label ?? "modifier"),
        label: String(m.label ?? m.key ?? "Modifier"),
        factor,
      };
    })
    .filter(
      (modifier): modifier is { key: string; label: string; factor: number } =>
        Boolean(modifier)
    );
  return modifiers.length ? modifiers : undefined;
}

// Replace all extracted lines for a review (stage-1 output / reprocess).
export const replaceLines = internalMutation({
  args: {
    reviewId: v.id("auditGuardReviews"),
    ownerId: v.string(),
    lines: v.any(),
  },
  handler: async (ctx, { reviewId, ownerId, lines }) => {
    const existing = await ctx.db
      .query("auditGuardLines")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .collect();
    for (const line of existing) {
      await ctx.db.delete(line._id);
    }

    for (const line of lines as Array<Record<string, unknown>>) {
      await ctx.db.insert("auditGuardLines", {
        ownerId,
        reviewId: reviewId as Id<"auditGuardReviews">,
        lineId: String(line.lineId),
        lineOfBusiness: String(line.lineOfBusiness),
        policyNumber: (line.policyNumber as string | null) ?? undefined,
        carrier: (line.carrier as string | null) ?? undefined,
        auditable: Boolean(line.auditable),
        ratingBasis: String(line.ratingBasis),
        ratingBasisLabel: String(line.ratingBasisLabel),
        unitSize: Number(line.unitSize) || 1,
        classCode: (line.classCode as string | null) ?? undefined,
        classCodeDescription:
          (line.classCodeDescription as string | null) ?? undefined,
        state: (line.state as string | null) ?? undefined,
        ratePerUnit:
          line.ratePerUnit === null || line.ratePerUnit === undefined
            ? undefined
            : Number(line.ratePerUnit),
        rateComponents: normalizeRateComponents(line.rateComponents),
        rateSource: String(line.rateSource ?? "unknown"),
        boundExposure:
          line.boundExposure === null || line.boundExposure === undefined
            ? undefined
            : Number(line.boundExposure),
        currentPremium:
          line.currentPremium === null || line.currentPremium === undefined
            ? undefined
            : Number(line.currentPremium),
        premiumModifiers: normalizePremiumModifiers(line.premiumModifiers),
        confidence: String(line.confidence ?? "low"),
        assumptions: (line.assumptions as string[]) ?? [],
        notes: (line.notes as string | null) ?? undefined,
        evidenceExcerpts: (line.evidenceExcerpts as string[]) ?? [],
        citations:
          (line.citations as Array<{
            documentName?: string;
            page?: number;
            excerpt: string;
          }>) ?? [],
        createdAt: Date.now(),
      });
    }
  },
});

// Apply the deterministic estimate to each line (stage-2 output).
export const applyLineEstimates = internalMutation({
  args: {
    reviewId: v.id("auditGuardReviews"),
    estimates: v.any(),
  },
  handler: async (ctx, { reviewId, estimates }) => {
    const lines = await ctx.db
      .query("auditGuardLines")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .collect();
    const byLineId = new Map(lines.map((line) => [line.lineId, line]));

    for (const est of estimates as Array<Record<string, unknown>>) {
      const line = byLineId.get(String(est.lineId));
      if (!line) continue;
      await ctx.db.patch(line._id, {
        estimateStatus: String(est.status),
        inputKey: (est.inputKey as string | null) ?? undefined,
        rawExposure:
          est.rawExposure === null || est.rawExposure === undefined
            ? undefined
            : Number(est.rawExposure),
        projectedExposure:
          est.projectedExposure === null || est.projectedExposure === undefined
            ? undefined
            : Number(est.projectedExposure),
        annualized: Boolean(est.annualized),
        additionalExposure:
          est.additionalExposure === null ||
          est.additionalExposure === undefined
            ? undefined
            : Number(est.additionalExposure),
        additionalPremium:
          est.additionalPremium === null || est.additionalPremium === undefined
            ? undefined
            : Number(est.additionalPremium),
        projectedPremium:
          est.projectedPremium === null || est.projectedPremium === undefined
            ? undefined
            : Number(est.projectedPremium),
        estimateReasoning: String(est.reasoning ?? ""),
      });
    }
  },
});
