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
import { authComponent } from "./auth";
import {
  getAccessState,
  isAgentAccess,
  requireAgentAccess,
  type AccessResult,
} from "./lib/access";

/*
 * CertMaster: contract in, EXAMPLE ACORD 25 out.
 *
 * One shared agency workspace: every agent sees and can work every request
 * (like the standalone app's org queue). Only the uploader or an admin can
 * delete. The pipeline lives in certRequestNode.ts.
 */

const IN_FLIGHT = new Set(["uploaded", "reading", "extracting", "generating"]);

type CertEvent = NonNullable<Doc<"certRequests">["events"]>[number];

async function agentOrNull(ctx: QueryCtx): Promise<AccessResult | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const access = await getAccessState(ctx);
  return isAgentAccess(access) ? access : null;
}

async function requireRequest(
  ctx: MutationCtx,
  requestId: Doc<"certRequests">["_id"],
): Promise<{ request: Doc<"certRequests">; access: AccessResult; actor: string }> {
  const access = await requireAgentAccess(ctx);
  const request = await ctx.db.get(requestId);
  if (!request || (request.status === "draft" && request.ownerId !== access.userId)) {
    throw new ConvexError("Certificate request not found");
  }
  return { request, access, actor: await actorName(ctx, access) };
}

async function actorName(ctx: QueryCtx | MutationCtx, access: AccessResult): Promise<string> {
  const user = await authComponent.safeGetAuthUser(ctx);
  return user?.name?.trim() || access.email || "An agent";
}

function withEvent(request: Doc<"certRequests">, event: CertEvent) {
  return [...(request.events ?? []), event].slice(-100);
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

/** The agency queue, newest first. Archived rows only when asked. */
export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    const access = await agentOrNull(ctx);
    if (!access) return [];
    const rows = await ctx.db.query("certRequests").order("desc").take(500);
    return rows
      .filter((r) => r.status !== "draft" && (includeArchived || !r.archivedAt))
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
          durationMs: r.durationMs ?? null,
          archived: !!r.archivedAt,
          mine: r.ownerId === access.userId,
          uploadedBy: r.uploadedByName ?? r.uploadedByEmail ?? null,
          docKind: r.docKind ?? null,
          errorCount: checks.filter((c) => c.severity === "error").length,
          warningCount: checks.filter((c) => c.severity === "warning").length,
        };
      });
  },
});

export const get = query({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const access = await agentOrNull(ctx);
    if (!access) return null;
    const r = await ctx.db.get(requestId);
    if (!r || r.status === "draft") return null;
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
      inputTokens: r.inputTokens ?? null,
      outputTokens: r.outputTokens ?? null,
      durationMs: r.durationMs ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      archived: !!r.archivedAt,
      uploadedBy: r.uploadedByName ?? r.uploadedByEmail ?? null,
      canDelete: r.ownerId === access.userId || access.state === "admin",
      events: r.events ?? [],
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
    const user = await authComponent.safeGetAuthUser(ctx);
    const requestId = await ctx.db.insert("certRequests", {
      ownerId: access.userId,
      uploadedByEmail: access.email ?? undefined,
      uploadedByName: user?.name?.trim() || undefined,
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
    const { request, access, actor } = await requireRequest(ctx, requestId);
    if (request.ownerId !== access.userId || request.status !== "draft") {
      throw new ConvexError("Request already started");
    }
    const now = Date.now();
    await ctx.db.patch(requestId, {
      storageId,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
      events: withEvent(request, { at: now, type: "uploaded", by: actor, detail: request.filename }),
    });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.run, { requestId });
    return { requestId };
  },
});

/** Re-run the whole pipeline (OCR + extraction) on the original file. */
export const rerun = mutation({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const { request, actor } = await requireRequest(ctx, requestId);
    if (IN_FLIGHT.has(request.status)) throw new ConvexError("Already running");
    if (!request.storageId) throw new ConvexError("Original file not found");
    await ctx.db.patch(requestId, {
      status: "uploaded",
      errorMessage: undefined,
      updatedAt: Date.now(),
      events: withEvent(request, { at: Date.now(), type: "rerun", by: actor }),
    });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.run, { requestId });
    return { requestId };
  },
});

const editsValidator = v.object({
  namedInsuredName: v.union(v.string(), v.null()),
  namedInsuredAddress: v.union(v.string(), v.null()),
  certificateHolderName: v.union(v.string(), v.null()),
  certificateHolderAddress: v.union(v.string(), v.null()),
  projectName: v.union(v.string(), v.null()),
  jobNumber: v.union(v.string(), v.null()),
});

/** Save the agent's corrections and regenerate the PDF (no new AI calls). */
export const saveEdits = mutation({
  args: { requestId: v.id("certRequests"), edits: editsValidator },
  handler: async (ctx, { requestId, edits }) => {
    const { request, actor } = await requireRequest(ctx, requestId);
    if (request.status !== "complete" || !request.requirements) {
      throw new ConvexError("Wait for the certificate to finish before editing");
    }
    await ctx.db.patch(requestId, {
      status: "generating",
      updatedAt: Date.now(),
      events: withEvent(request, { at: Date.now(), type: "edited", by: actor }),
    });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.regenerate, { requestId, edits });
    return { requestId };
  },
});

/** Throw away edits and go back to what was extracted. */
export const resetEdits = mutation({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const { request, actor } = await requireRequest(ctx, requestId);
    if (request.status !== "complete" || !request.extractedRequirements) {
      throw new ConvexError("Nothing to reset");
    }
    await ctx.db.patch(requestId, {
      status: "generating",
      updatedAt: Date.now(),
      events: withEvent(request, { at: Date.now(), type: "reset", by: actor }),
    });
    await ctx.scheduler.runAfter(0, internal.certRequestNode.regenerate, { requestId, reset: true });
    return { requestId };
  },
});

/** Hide from the queue and stats; nothing is deleted. */
export const setArchived = mutation({
  args: { requestId: v.id("certRequests"), archived: v.boolean() },
  handler: async (ctx, { requestId, archived }) => {
    const { request, actor } = await requireRequest(ctx, requestId);
    await ctx.db.patch(requestId, {
      archivedAt: archived ? Date.now() : undefined,
      updatedAt: Date.now(),
      events: withEvent(request, {
        at: Date.now(),
        type: archived ? "archived" : "unarchived",
        by: actor,
      }),
    });
  },
});

/** Permanent delete: the uploader or an admin only. */
export const remove = mutation({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const { request, access } = await requireRequest(ctx, requestId);
    if (request.ownerId !== access.userId && access.state !== "admin") {
      throw new ConvexError("Only the agent who uploaded this, or an admin, can delete it. Archive it instead.");
    }
    if (request.storageId) await ctx.storage.delete(request.storageId);
    if (request.pdfStorageId) await ctx.storage.delete(request.pdfStorageId);
    await ctx.db.delete(requestId);
  },
});

/* ------------------------------------------------------------------ */
/*  Internal (used by certRequestNode)                                */
/* ------------------------------------------------------------------ */

export const getInternal = internalQuery({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => ctx.db.get(requestId),
});

/**
 * Action args drop `undefined`, so the node side sends errorMessage: "" to
 * mean "clear the error", and `event` to append to the audit trail.
 */
function applyPatch(request: Doc<"certRequests">, patch: Record<string, unknown>) {
  const { event, ...rest } = patch as Record<string, unknown> & { event?: CertEvent };
  const out: Record<string, unknown> = { ...rest, updatedAt: Date.now() };
  if (rest.errorMessage === "") out.errorMessage = undefined;
  if (event) out.events = withEvent(request, { ...event, at: Date.now() });
  return out;
}

export const patchInternal = internalMutation({
  args: { requestId: v.id("certRequests"), patch: v.any() },
  handler: async (ctx, { requestId, patch }) => {
    const request = await ctx.db.get(requestId);
    if (!request) return;
    await ctx.db.patch(requestId, applyPatch(request, patch));
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
    await ctx.db.patch(requestId, { ...applyPatch(request, patch), pdfStorageId });
  },
});
