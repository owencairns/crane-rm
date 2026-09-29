import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { daysToMs, requireAdmin } from "./lib/access";

/**
 * One-off data-maintenance: reassign AuditGuard reviews (and their lines)
 * from one owner to another. Internal — runnable only via `npx convex run`.
 */
export const reassignAuditGuardOwner = internalMutation({
  args: {
    fromOwnerId: v.string(),
    toOwnerId: v.string(),
  },
  handler: async (ctx, { fromOwnerId, toOwnerId }) => {
    const reviews = await ctx.db
      .query("auditGuardReviews")
      .withIndex("by_owner", (q) => q.eq("ownerId", fromOwnerId))
      .collect();
    let lineCount = 0;
    for (const review of reviews) {
      await ctx.db.patch(review._id, { ownerId: toOwnerId });
      const lines = await ctx.db
        .query("auditGuardLines")
        .withIndex("by_review", (q) => q.eq("reviewId", review._id))
        .collect();
      for (const line of lines) {
        await ctx.db.patch(line._id, { ownerId: toOwnerId });
        lineCount += 1;
      }
    }
    return { reviewsMoved: reviews.length, linesMoved: lineCount };
  },
});

/**
 * Admin user-management. "Users" are people who accepted an invitation and so
 * have a `userAccess` grant. Admins (ADMIN_EMAILS) are implicit and not listed
 * here — they always have access.
 */

function derivedStatus(
  access: { status: string; accessExpiresAt?: number },
  now: number
): "active" | "expired" | "revoked" {
  if (access.status === "revoked") return "revoked";
  // Absent accessExpiresAt = unlimited access — never expires.
  if (access.accessExpiresAt !== undefined && access.accessExpiresAt < now)
    return "expired";
  return "active";
}

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const grants = await ctx.db.query("userAccess").collect();
    const now = Date.now();
    return grants
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((g) => ({
        id: g._id,
        email: g.email,
        status: derivedStatus(g, now),
        accessStartsAt: g.accessStartsAt,
        // null = unlimited access
        accessExpiresAt: g.accessExpiresAt ?? null,
        createdAt: g.createdAt,
      }));
  },
});

/** Add days onto the current expiry (from now if already expired). */
export const extendAccess = mutation({
  args: { userAccessId: v.id("userAccess"), days: v.number() },
  handler: async (ctx, { userAccessId, days }) => {
    await requireAdmin(ctx);
    const access = await ctx.db.get(userAccessId);
    if (!access) throw new ConvexError("User access record not found.");
    const addDays = Math.min(3650, Math.max(1, Math.round(days)));
    const now = Date.now();
    if (access.accessExpiresAt === undefined) {
      // Already unlimited — extending is a no-op beyond ensuring it's active.
      await ctx.db.patch(userAccessId, { status: "active", updatedAt: now });
      return;
    }
    const base = Math.max(now, access.accessExpiresAt);
    await ctx.db.patch(userAccessId, {
      status: "active",
      accessExpiresAt: base + daysToMs(addDays),
      updatedAt: now,
    });
  },
});

/** Start a fresh window of `days` from now. */
export const renewAccess = mutation({
  args: { userAccessId: v.id("userAccess"), days: v.number() },
  handler: async (ctx, { userAccessId, days }) => {
    await requireAdmin(ctx);
    const access = await ctx.db.get(userAccessId);
    if (!access) throw new ConvexError("User access record not found.");
    const windowDays = Math.min(3650, Math.max(1, Math.round(days)));
    const now = Date.now();
    await ctx.db.patch(userAccessId, {
      status: "active",
      accessStartsAt: now,
      accessExpiresAt: now + daysToMs(windowDays),
      updatedAt: now,
    });
  },
});

/**
 * Remove the expiry lock entirely — the grant never expires.
 * (Absent accessExpiresAt = unlimited.) Also reactivates a revoked grant.
 */
export const grantUnlimitedAccess = mutation({
  args: { userAccessId: v.id("userAccess") },
  handler: async (ctx, { userAccessId }) => {
    await requireAdmin(ctx);
    const access = await ctx.db.get(userAccessId);
    if (!access) throw new ConvexError("User access record not found.");
    await ctx.db.patch(userAccessId, {
      status: "active",
      accessExpiresAt: undefined, // unset — unlimited
      updatedAt: Date.now(),
    });
  },
});

export const revokeAccess = mutation({
  args: { userAccessId: v.id("userAccess") },
  handler: async (ctx, { userAccessId }) => {
    await requireAdmin(ctx);
    const access = await ctx.db.get(userAccessId);
    if (!access) throw new ConvexError("User access record not found.");
    await ctx.db.patch(userAccessId, {
      status: "revoked",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Un-revoke: set the grant active again with its existing window intact.
 * If that window has already passed, the user shows as expired — use
 * extend/renew/unlimited to give them time.
 */
export const restoreAccess = mutation({
  args: { userAccessId: v.id("userAccess") },
  handler: async (ctx, { userAccessId }) => {
    await requireAdmin(ctx);
    const access = await ctx.db.get(userAccessId);
    if (!access) throw new ConvexError("User access record not found.");
    if (access.status !== "revoked") {
      throw new ConvexError("Access is not revoked.");
    }
    await ctx.db.patch(userAccessId, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});
