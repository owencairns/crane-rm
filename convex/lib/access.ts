import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

/**
 * Access control helpers for the invitation-only suite.
 *
 * Identity note: we key access off `identity.subject` (the Better Auth user
 * id), which is the exact value used as `ownerId` on contracts/coiReviews.
 * That keeps a user's access grant and their data in lockstep.
 */

export type AccessState =
  | "admin"
  | "active"
  | "expired"
  | "revoked"
  | "none";

const DAY_MS = 24 * 60 * 60 * 1000;

export function adminEmails(): string[] {
  // Admins come from ADMIN_EMAILS and/or the pre-existing SUPER_ADMIN_EMAILS
  // (comma-separated). Either var grants admin; merged + de-duped.
  const raw = `${process.env.ADMIN_EMAILS ?? ""},${
    process.env.SUPER_ADMIN_EMAILS ?? ""
  }`;
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function daysToMs(days: number): number {
  return Math.round(days * DAY_MS);
}

export interface AuthedUser {
  userId: string;
  email: string | null;
}

/** Throws if unauthenticated. Returns the Better Auth user id + email. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<AuthedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  const userId = identity.subject;
  let email = (identity.email as string | undefined) ?? null;
  if (!email) {
    const user = await authComponent.getAuthUser(ctx);
    email = user?.email ?? null;
  }
  return { userId, email: email ? normalizeEmail(email) : null };
}

export interface AccessResult {
  state: AccessState;
  userId: string;
  email: string | null;
  expiresAt: number | null;
}

/** Resolve the current user's access state. */
export async function getAccessState(
  ctx: QueryCtx | MutationCtx
): Promise<AccessResult> {
  const { userId, email } = await requireUser(ctx);

  if (isAdminEmail(email)) {
    return { state: "admin", userId, email, expiresAt: null };
  }

  const access = await ctx.db
    .query("userAccess")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (!access) {
    return { state: "none", userId, email, expiresAt: null };
  }
  // Absent accessExpiresAt = unlimited access (never expires).
  const expiresAt = access.accessExpiresAt ?? null;
  if (access.status === "revoked") {
    return { state: "revoked", userId, email, expiresAt };
  }
  if (expiresAt !== null && expiresAt < Date.now()) {
    return { state: "expired", userId, email, expiresAt };
  }
  return { state: "active", userId, email, expiresAt };
}

export function hasToolAccess(state: AccessState): boolean {
  return state === "admin" || state === "active";
}

/**
 * Gate a tool action/query on an active grant. Admins always pass.
 * Throws a user-facing ConvexError otherwise.
 */
export async function requireActiveAccess(
  ctx: QueryCtx | MutationCtx
): Promise<AccessResult> {
  const result = await getAccessState(ctx);
  if (!hasToolAccess(result.state)) {
    throw new ConvexError(
      "Your access to the Red Cedar Suite is not active. Please contact your administrator."
    );
  }
  return result;
}

/** Feature flag: AuditGuard is gated until launch (Convex env AUDITGUARD_ENABLED). */
export function requireAuditGuardEnabled(): void {
  if (process.env.AUDITGUARD_ENABLED !== "true") {
    throw new ConvexError("AuditGuard is coming soon.");
  }
}

/** Gate an admin-only function. Returns the resolved access result. */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<AccessResult> {
  const result = await getAccessState(ctx);
  if (result.state !== "admin") {
    throw new ConvexError("Administrator access required.");
  }
  return result;
}
