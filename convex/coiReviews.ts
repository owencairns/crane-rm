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
import { requireActiveAccess } from "./lib/access";

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

function toReviewListItem(review: Doc<"coiReviews">) {
  const coiFilenames = review.coiFilenames ?? [review.coiFilename];
  return {
    id: review._id,
    insuredName: review.insuredName || review.coiFilename,
    requirementsFilename: review.requirementsFilename,
    coiFilename: review.coiFilename,
    coiFilenames,
    status: review.status,
    date: formatDate(review.createdAt),
    summaryCounts: review.summaryCounts,
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
      .query("coiReviews")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    return reviews
      .filter((review) => review.status !== "draft")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toReviewListItem);
  },
});

export const get = query({
  args: { reviewId: v.id("coiReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId || review.status === "draft") {
      return null;
    }
    return {
      id: review._id,
      insuredName: review.insuredName,
      requirementsFilename: review.requirementsFilename,
      coiFilename: review.coiFilename,
      coiFilenames: review.coiFilenames ?? [review.coiFilename],
      status: review.status,
      date: formatDate(review.createdAt),
      summaryCounts: review.summaryCounts,
      errorMessage: review.errorMessage,
    };
  },
});

export const getResults = query({
  args: { reviewId: v.id("coiReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      return null;
    }

    const findings = await ctx.db
      .query("coiFindings")
      .withIndex("by_review", (q) => q.eq("coiReviewId", reviewId))
      .collect();

    return {
      reviewId,
      status: review.status,
      insuredName: review.insuredName,
      requirementsFilename: review.requirementsFilename,
      coiFilename: review.coiFilename,
      coiFilenames: review.coiFilenames ?? [review.coiFilename],
      summaryCounts: review.summaryCounts,
      errorMessage: review.errorMessage,
      completedAt: review.updatedAt,
      findings: findings
        .sort((a, b) => a.itemId.localeCompare(b.itemId))
        .map((finding) => ({
          id: finding.itemId,
          category: finding.category,
          label: finding.label,
          priority: finding.priority,
          status: finding.status,
          requiredValue: finding.requiredValue,
          foundValue: finding.foundValue,
          reasoning: finding.reasoning,
          recommendedAction: finding.recommendedAction,
          requirementSource: finding.requirementSource,
          requirementEvidenceExcerpts: finding.requirementEvidenceExcerpts ?? [],
          requirementCitations: finding.requirementCitations ?? [],
          coiEvidenceExcerpts:
            finding.coiEvidenceExcerpts ?? finding.evidenceExcerpts ?? [],
          coiCitations: finding.coiCitations ?? [],
          sourceLinks: finding.sourceLinks ?? [],
        })),
    };
  },
});

export const getDocumentUrls = query({
  args: { reviewId: v.id("coiReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId || review.status === "draft") {
      return null;
    }

    const requirementsUrl = review.requirementsStorageId
      ? await ctx.storage.getUrl(review.requirementsStorageId)
      : null;
    const coiStorageIds =
      review.coiStorageIds ?? (review.coiStorageId ? [review.coiStorageId] : []);
    const coiFilenames =
      review.coiFilenames && review.coiFilenames.length === coiStorageIds.length
        ? review.coiFilenames
        : coiStorageIds.map((_, index) =>
            index === 0 ? review.coiFilename : `COI attachment ${index + 1}`
          );

    const coiDocuments = await Promise.all(
      coiStorageIds.map(async (storageId, index) => ({
        filename: coiFilenames[index],
        url: await ctx.storage.getUrl(storageId),
      }))
    );

    return {
      requirements: {
        filename: review.requirementsFilename,
        url: requirementsUrl,
      },
      coiDocuments,
    };
  },
});

/* ------------------------------------------------------------------ */
/*  Public mutations                                                  */
/* ------------------------------------------------------------------ */

// Step 1: create a draft review + two upload URLs (requirements doc + COI).
export const requestReview = mutation({
  args: {
    requirementsFilename: v.string(),
    coiFilename: v.optional(v.string()),
    coiFilenames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { requirementsFilename, coiFilename, coiFilenames }) => {
    await requireActiveAccess(ctx);
    const ownerId = await requireUserId(ctx);
    const now = Date.now();
    const filenames =
      coiFilenames && coiFilenames.length > 0
        ? coiFilenames
        : coiFilename
          ? [coiFilename]
          : [];
    if (filenames.length === 0) {
      throw new ConvexError("At least one COI or endorsement PDF is required");
    }
    const displayFilename =
      filenames.length === 1
        ? filenames[0]
        : `${filenames[0]} + ${filenames.length - 1} attachment${
            filenames.length === 2 ? "" : "s"
          }`;

    const requirementsUploadUrl = await ctx.storage.generateUploadUrl();
    const coiUploadUrls = await Promise.all(
      filenames.map(() => ctx.storage.generateUploadUrl())
    );

    const reviewId = await ctx.db.insert("coiReviews", {
      ownerId,
      requirementsFilename,
      coiFilename: displayFilename,
      coiFilenames: filenames,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    return {
      reviewId,
      requirementsUploadUrl,
      coiUploadUrl: coiUploadUrls[0],
      coiUploadUrls,
    };
  },
});

// Step 2: both files uploaded — record storage ids and kick off processing.
export const startReview = mutation({
  args: {
    reviewId: v.id("coiReviews"),
    requirementsStorageId: v.id("_storage"),
    coiStorageId: v.optional(v.id("_storage")),
    coiStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (
    ctx,
    { reviewId, requirementsStorageId, coiStorageId, coiStorageIds }
  ) => {
    await requireActiveAccess(ctx);
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }
    const storageIds =
      coiStorageIds && coiStorageIds.length > 0
        ? coiStorageIds
        : coiStorageId
          ? [coiStorageId]
          : [];
    if (storageIds.length === 0) {
      throw new ConvexError("At least one COI or endorsement PDF is required");
    }

    await ctx.db.patch(reviewId, {
      requirementsStorageId,
      coiStorageId: storageIds[0],
      coiStorageIds: storageIds,
      status: "uploaded",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.coiReviewNode.ingestReview, {
      reviewId,
      ownerId,
    });

    return { reviewId, status: "queued" };
  },
});

export const reprocessReview = mutation({
  args: { reviewId: v.id("coiReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }
    if (review.status !== "failed") {
      throw new ConvexError("Only failed reviews can be reprocessed");
    }
    const coiStorageIds = review.coiStorageIds ?? (review.coiStorageId ? [review.coiStorageId] : []);
    if (!review.requirementsStorageId || coiStorageIds.length === 0) {
      throw new ConvexError("Cannot reprocess — original files not found");
    }

    await ctx.db.patch(reviewId, { status: "uploaded", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.coiReviewNode.ingestReview, {
      reviewId,
      ownerId,
    });
    return { reviewId, status: "queued" };
  },
});

export const deleteReview = mutation({
  args: { reviewId: v.id("coiReviews") },
  handler: async (ctx, { reviewId }) => {
    const ownerId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.ownerId !== ownerId) {
      throw new ConvexError("Review not found");
    }

    if (review.requirementsStorageId) {
      await ctx.storage.delete(review.requirementsStorageId);
    }
    const coiStorageIds = review.coiStorageIds ?? (review.coiStorageId ? [review.coiStorageId] : []);
    for (const storageId of new Set(coiStorageIds)) {
      await ctx.storage.delete(storageId);
    }

    const findings = await ctx.db
      .query("coiFindings")
      .withIndex("by_review", (q) => q.eq("coiReviewId", reviewId))
      .collect();
    for (const finding of findings) {
      await ctx.db.delete(finding._id);
    }

    await ctx.db.delete(reviewId);
    return { reviewId, message: "Review deleted" };
  },
});

/* ------------------------------------------------------------------ */
/*  Internal queries / mutations (used by coiReviewNode action)        */
/* ------------------------------------------------------------------ */

export const getReviewRecord = internalQuery({
  args: { reviewId: v.id("coiReviews") },
  handler: async (ctx, { reviewId }) => {
    return await ctx.db.get(reviewId);
  },
});

export const patchReview = internalMutation({
  args: { reviewId: v.id("coiReviews"), patch: v.any() },
  handler: async (ctx, { reviewId, patch }) => {
    await ctx.db.patch(reviewId, patch);
  },
});

export const replaceFindings = internalMutation({
  args: {
    reviewId: v.id("coiReviews"),
    ownerId: v.string(),
    findings: v.any(),
  },
  handler: async (ctx, { reviewId, ownerId, findings }) => {
    // Clear any prior findings (reprocess) then insert fresh.
    const existing = await ctx.db
      .query("coiFindings")
      .withIndex("by_review", (q) => q.eq("coiReviewId", reviewId))
      .collect();
    for (const finding of existing) {
      await ctx.db.delete(finding._id);
    }

    for (const finding of findings as Array<Record<string, unknown>>) {
      await ctx.db.insert("coiFindings", {
        ownerId,
        coiReviewId: reviewId as Id<"coiReviews">,
        itemId: String(finding.itemId),
        category: String(finding.category),
        label: String(finding.label),
        priority: String(finding.priority),
        requirementSource: String(
          finding.requirementSource ?? "requirements_document"
        ),
        status: String(finding.status),
        requiredValue: finding.requiredValue as string | undefined,
        foundValue: finding.foundValue as string | undefined,
        reasoning: String(finding.reasoning ?? ""),
        recommendedAction: finding.recommendedAction as string | undefined,
        requirementEvidenceExcerpts:
          (finding.requirementEvidenceExcerpts as string[]) ?? [],
        requirementCitations:
          (finding.requirementCitations as Array<{
            documentName?: string;
            page?: number;
            excerpt: string;
          }>) ?? [],
        coiEvidenceExcerpts:
          (finding.coiEvidenceExcerpts as string[]) ??
          (finding.evidenceExcerpts as string[]) ??
          [],
        coiCitations:
          (finding.coiCitations as Array<{
            documentName?: string;
            page?: number;
            excerpt: string;
          }>) ?? [],
        sourceLinks:
          (finding.sourceLinks as Array<{ label: string; url: string }>) ??
          undefined,
        evidenceExcerpts:
          (finding.coiEvidenceExcerpts as string[]) ??
          (finding.evidenceExcerpts as string[]) ??
          [],
        createdAt: Date.now(),
      });
    }
  },
});
