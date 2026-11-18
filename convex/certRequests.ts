import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAccessState, isAgentAccess, requireAgentAccess } from "./lib/access";

/*
 * CertMaster: contract in, EXAMPLE ACORD 25 out. Agents only.
 * Pipeline lives in certRequestNode.ts.
 */

const IN_FLIGHT = new Set(["uploaded", "reading", "extracting", "generating"]);

async function optionalAgentOwner(
  ctx: QueryCtx,
  requestId: Doc<"certRequests">["_id"],
): Promise<Doc<"certRequests"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const access = await getAccessState(ctx);
  if (!isAgentAccess(access)) return null;
  const request = await ctx.db.get(requestId);
  if (!request || request.ownerId !== access.userId || request.status === "draft") {
    return null;
  }
  return request;
}

async function requireOwnedRequest(
  ctx: MutationCtx,
  requestId: Doc<"certRequests">["_id"],
): Promise<Doc<"certRequests">> {
  const access = await requireAgentAccess(ctx);
  const request = await ctx.db.get(requestId);
  if (!request || request.ownerId !== access.userId) {
    throw new ConvexError("Certificate request not found");
  }
  return request;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Queries                                                           */
/* ------------------------------------------------------------------ */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const access = await getAccessState(ctx);
    if (!isAgentAccess(access)) return [];
    const rows = await ctx.db
      .query("certRequests")
      .withIndex("by_owner", (q) => q.eq("ownerId", access.userId))
      .order("desc")
      .take(100);
    return rows
      .filter((r) => r.status !== "draft")
      .map((r) => {
        const checks = parseJson<Array<{ severity: string }>>(r.checks, []);
        return {
          id: r._id,
          filename: r.filename,
          projectName: r.projectName ?? null,
          holderName: r.holderName ?? null,
          insuredName: r.insuredName ?? null,
          status: r.status,
          createdAt: r.createdAt,
          errorCount: checks.filter((c) => c.severity === "error").length,
          warningCount: checks.filter((c) => c.severity === "warning").length,
        };
      });
  },
});

export const get = query({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const r = await optionalAgentOwner(ctx, requestId);
    if (!r) return null;
    return {
      id: r._id,
      filename: r.filename,
      status: r.status,
      pageCount: r.pageCount ?? null,
      projectName: r.projectName ?? null,
      holderName: r.holderName ?? null,
      insuredName: r.insuredName ?? null,
      requirements: parseJson<unknown>(r.requirements, null),
      evidence: parseJson<unknown[]>(r.evidence, []),
      checks: parseJson<unknown[]>(r.checks, []),
      remarks: r.remarks ?? null,
      edited: !!r.extractedRequirements && r.extractedRequirements !== r.requirements,
      errorMessage: r.errorMessage ?? null,
      model: r.model ?? null,
      durationMs: r.durationMs ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      pdfUrl: r.pdfStorageId ? await ctx.storage.getUrl(r.pdfStorageId) : null,
      sourceUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
    };
  },
});

/* ------------------------------------------------------------------ */
/*  Mutations                                                         */
/* ------------------------------------------------------------------ */

/** Step 1: create a draft and hand back an upload URL. */
export const requestUpload = mutation({
  args: { filename: v.string() },
  handler: async (ctx, { filename }) => {
    const access = await requireAgentAccess(ctx);
    const now = Date.now();
    const requestId = await ctx.db.insert("certRequests", {
      ownerId: access.userId,
      filename,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { requestId, uploadUrl };
  },
});

/** Step 2: file uploaded; start the pipeline. */
export const start = mutation({
  args: { requestId: v.id("certRequests"), storageId: v.id("_storage") },
  handler: async (ctx, { requestId, storageId }) => {
    const request = await requireOwnedRequest(ctx, requestId);
    if (request.status !== "draft") throw new ConvexError("Request already started");
    await ctx.db.patch(requestId, { storageId, status: "uploaded", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.run, { requestId });
    return { requestId };
  },
});

/** Re-run the whole pipeline (OCR + extraction) on the original file. */
export const rerun = mutation({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await requireOwnedRequest(ctx, requestId);
    if (IN_FLIGHT.has(request.status)) throw new ConvexError("Already running");
    if (!request.storageId) throw new ConvexError("Original file not found");
    await ctx.db.patch(requestId, {
      status: "uploaded",
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.run, { requestId });
    return { requestId };
  },
});

/** Save the agent's corrections and regenerate the PDF (no new AI calls). */
export const saveEdits = mutation({
  args: {
    requestId: v.id("certRequests"),
    edits: v.object({
      namedInsuredName: v.union(v.string(), v.null()),
      namedInsuredAddress: v.union(v.string(), v.null()),
      certificateHolderName: v.union(v.string(), v.null()),
      certificateHolderAddress: v.union(v.string(), v.null()),
      projectName: v.union(v.string(), v.null()),
      jobNumber: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, { requestId, edits }) => {
    const request = await requireOwnedRequest(ctx, requestId);
    if (request.status !== "complete" || !request.requirements) {
      throw new ConvexError("Wait for the certificate to finish before editing");
    }
    await ctx.db.patch(requestId, { status: "generating", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.regenerate, { requestId, edits });
    return { requestId };
  },
});

/** Throw away edits and go back to what was extracted. */
export const resetEdits = mutation({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await requireOwnedRequest(ctx, requestId);
    if (request.status !== "complete" || !request.extractedRequirements) {
      throw new ConvexError("Nothing to reset");
    }
    await ctx.db.patch(requestId, { status: "generating", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.regenerate, { requestId, reset: true });
    return { requestId };
  },
});

export const remove = mutation({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await requireOwnedRequest(ctx, requestId);
    if (request.storageId) await ctx.storage.delete(request.storageId);
    if (request.pdfStorageId) await ctx.storage.delete(request.pdfStorageId);
    await ctx.db.delete(requestId);
  },
});

/* ------------------------------------------------------------------ */
/*  Internal (used by certRequestNode)                                */
/* ------------------------------------------------------------------ */

// Action args drop `undefined`, so the node side sends errorMessage: "" to
// mean "clear the error".
function withClearedError(patch: Record<string, unknown>) {
  return patch.errorMessage === "" ? { ...patch, errorMessage: undefined } : patch;
}

export const getInternal = internalQuery({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => ctx.db.get(requestId),
});

export const patchInternal = internalMutation({
  args: { requestId: v.id("certRequests"), patch: v.any() },
  handler: async (ctx, { requestId, patch }) => {
    await ctx.db.patch(requestId, { ...withClearedError(patch), updatedAt: Date.now() });
  },
});

/** Swap in a new PDF and delete the old one. */
export const replacePdf = internalMutation({
  args: {
    requestId: v.id("certRequests"),
    pdfStorageId: v.id("_storage"),
    patch: v.any(),
  },
  handler: async (ctx, { requestId, pdfStorageId, patch }) => {
    const request = await ctx.db.get(requestId);
    if (!request) {
      await ctx.storage.delete(pdfStorageId);
      return;
    }
    if (request.pdfStorageId && request.pdfStorageId !== pdfStorageId) {
      await ctx.storage.delete(request.pdfStorageId);
    }
    await ctx.db.patch(requestId, { ...withClearedError(patch), pdfStorageId, updatedAt: Date.now() });
  },
});
