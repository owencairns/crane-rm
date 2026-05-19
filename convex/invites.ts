import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { isSuperAdminEmail } from "./lib/admin";

function generateToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthorized");
  if (!isSuperAdminEmail(identity.email)) throw new ConvexError("Forbidden");
  return identity;
}

export const create = mutation({
  args: {
    note: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireSuperAdmin(ctx);
    const token = generateToken();
    const now = Date.now();
    const expiresAt =
      args.expiresInDays !== undefined
        ? now + args.expiresInDays * 24 * 60 * 60 * 1000
        : undefined;

    const id = await ctx.db.insert("invites", {
      token,
      createdBy: me.subject,
      createdAt: now,
      expiresAt,
      note: args.note,
    });
    return { id, token };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const all = await ctx.db.query("invites").order("desc").collect();
    return all.map((i) => ({
      id: i._id,
      token: i.token,
      note: i.note,
      createdAt: i.createdAt,
      createdBy: i.createdBy,
      expiresAt: i.expiresAt,
      consumedBy: i.consumedBy,
      consumedAt: i.consumedAt,
      revokedAt: i.revokedAt,
    }));
  },
});

export const revoke = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const invite = await ctx.db.get(args.id);
    if (!invite) throw new ConvexError("Invite not found");
    if (invite.consumedAt) throw new ConvexError("Cannot revoke a consumed invite");
    if (invite.revokedAt) return;
    await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});

export const validate = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite) return { status: "invalid" as const };
    if (invite.revokedAt) return { status: "revoked" as const };
    if (invite.consumedAt) return { status: "consumed" as const };
    if (invite.expiresAt && invite.expiresAt < Date.now())
      return { status: "expired" as const };
    return { status: "valid" as const, note: invite.note };
  },
});

export const consumeForSignup = internalMutation({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite) throw new Error("Invalid invite");
    if (invite.revokedAt) throw new Error("Invite was revoked");
    if (invite.consumedAt) throw new Error("Invite already used");
    if (invite.expiresAt && invite.expiresAt < Date.now())
      throw new Error("Invite expired");

    await ctx.db.patch(invite._id, {
      consumedBy: args.email,
      consumedAt: Date.now(),
    });
  },
});
