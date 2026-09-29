import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/access";
import { INVITE_EMAIL_DEFAULTS } from "./lib/inviteEmail";

/**
 * The saved invitation-email template. Exactly one row is ever kept; saving
 * upserts it. Until an admin saves, callers fall back to INVITE_EMAIL_DEFAULTS.
 */

/** Admin-facing: current saved template (or the built-in default). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await ctx.db.query("inviteEmailTemplate").first();
    return {
      subject: row?.subject ?? INVITE_EMAIL_DEFAULTS.subject,
      body: row?.body ?? INVITE_EMAIL_DEFAULTS.body,
      updatedAt: row?.updatedAt ?? null,
      updatedByEmail: row?.updatedByEmail ?? null,
      isDefault: row === null,
    };
  },
});

/** Internal: used by the send action. Returns null if nothing saved yet. */
export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("inviteEmailTemplate").first();
    if (!row) return null;
    return { subject: row.subject, body: row.body };
  },
});

/** Admin-only: upsert the single saved template row. */
export const save = mutation({
  args: {
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { email } = await requireUser(ctx);

    const subject = args.subject.trim();
    const body = args.body.trim();
    if (!subject) throw new Error("Subject cannot be empty.");
    if (!body) throw new Error("Body cannot be empty.");

    const existing = await ctx.db.query("inviteEmailTemplate").first();
    const patch = {
      subject,
      body,
      updatedAt: Date.now(),
      updatedByEmail: email ?? undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("inviteEmailTemplate", patch);
    }
    return { ok: true };
  },
});
