import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const adminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
}

export async function getCallerRole(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const isSuperAdmin = isSuperAdminEmail(identity.email);
  let isAdmin = isSuperAdmin;
  if (!isAdmin) {
    const role = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    isAdmin = Boolean(role);
  }
  return { identity, isAdmin, isSuperAdmin };
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const role = await getCallerRole(ctx);
  if (!role) throw new ConvexError("Unauthorized");
  if (!role.isAdmin) throw new ConvexError("Forbidden");
  return role;
}

export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const role = await getCallerRole(ctx);
  if (!role) throw new ConvexError("Unauthorized");
  if (!role.isSuperAdmin) throw new ConvexError("Forbidden");
  return role;
}
