import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { authComponent } from "./auth";
import { isSuperAdminEmail, requireSuperAdmin } from "./lib/admin";

type BetterAuthUser = {
  _id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  createdAt: number;
  updatedAt: number;
};

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const users: BetterAuthUser[] = [];
    let cursor: string | null = null;
    while (true) {
      const page: {
        page: BetterAuthUser[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user",
        paginationOpts: { numItems: 200, cursor },
      });
      users.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const roles = await ctx.db.query("userRoles").collect();
    const adminUserIds = new Set(roles.map((r) => r.userId));

    return users
      .map((u) => ({
        id: u._id,
        email: u.email,
        name: u.name ?? null,
        emailVerified: Boolean(u.emailVerified),
        createdAt: u.createdAt,
        isSuperAdmin: isSuperAdminEmail(u.email),
        isAdmin: isSuperAdminEmail(u.email) || adminUserIds.has(u._id),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const promote = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const me = await requireSuperAdmin(ctx);

    const target = await authComponent.getAnyUserById(ctx, userId);
    if (!target) throw new ConvexError("User not found");

    if (isSuperAdminEmail(target.email)) {
      throw new ConvexError("Super-admins are managed via env var");
    }

    const existing = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return;

    await ctx.db.insert("userRoles", {
      userId,
      role: "admin",
      grantedAt: Date.now(),
      grantedBy: me.identity.subject,
    });
  },
});

export const demote = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await requireSuperAdmin(ctx);

    const existing = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});
