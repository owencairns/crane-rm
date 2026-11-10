import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  daysToMs,
  normalizeEmail,
  requireAdmin,
  requireUser,
} from "./lib/access";

const DEFAULT_ACCESS_WINDOW_DAYS = 90;
const DEFAULT_INVITE_VALID_DAYS = 14;

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

function inviteUrlFor(token: string): string {
  return `${siteUrl().replace(/\/$/, "")}/accept-invite?token=${token}`;
}

function generateToken(): string {
  // Two UUIDs, dashes stripped → 64 hex chars of entropy.
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

function clampDays(days: number | undefined, fallback: number): number {
  if (days === undefined || !Number.isFinite(days)) return fallback;
  return Math.min(3650, Math.max(1, Math.round(days)));
}

/* ------------------------------------------------------------------ */
/*  Admin: create / manage invitations                                */
/* ------------------------------------------------------------------ */

export const create = mutation({
  args: {
    email: v.string(),
    accessWindowDays: v.optional(v.number()),
    inviteValidDays: v.optional(v.number()),
    emailSubject: v.optional(v.string()),
    emailBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) {
      throw new ConvexError("Enter a valid email address.");
    }

    const accessWindowDays = clampDays(
      args.accessWindowDays,
      DEFAULT_ACCESS_WINDOW_DAYS
    );
    const inviteValidDays = clampDays(
      args.inviteValidDays,
      DEFAULT_INVITE_VALID_DAYS
    );
    const now = Date.now();
    const token = generateToken();
    const expiresAt = now + daysToMs(inviteValidDays);
    const emailSubject = args.emailSubject?.trim() || undefined;
    const emailBody = args.emailBody?.trim() || undefined;

    // Reuse an existing pending invite for this email rather than duplicate.
    const existingPending = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    let invitationId;
    if (existingPending) {
      await ctx.db.patch(existingPending._id, {
        token,
        accessWindowDays,
        emailSubject,
        emailBody,
        invitedByUserId: admin.userId,
        invitedByEmail: admin.email ?? "",
        expiresAt,
        lastSendError: undefined,
        updatedAt: now,
      });
      invitationId = existingPending._id;
    } else {
      invitationId = await ctx.db.insert("invitations", {
        email,
        token,
        status: "pending",
        accessWindowDays,
        emailSubject,
        emailBody,
        invitedByUserId: admin.userId,
        invitedByEmail: admin.email ?? "",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.email.sendInvitationEmail, {
      invitationId,
    });

    return { invitationId, token, inviteUrl: inviteUrlFor(token) };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const invitations = await ctx.db.query("invitations").collect();
    const now = Date.now();
    return invitations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((inv) => ({
        id: inv._id,
        email: inv.email,
        status: inv.status,
        accessWindowDays: inv.accessWindowDays,
        invitedByEmail: inv.invitedByEmail,
        expiresAt: inv.expiresAt,
        linkExpired: inv.status === "pending" && inv.expiresAt < now,
        acceptedAt: inv.acceptedAt ?? null,
        lastSentAt: inv.lastSentAt ?? null,
        lastSendError: inv.lastSendError ?? null,
        createdAt: inv.createdAt,
        inviteUrl: inviteUrlFor(inv.token),
      }));
  },
});

export const revoke = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    await requireAdmin(ctx);
    const inv = await ctx.db.get(invitationId);
    if (!inv) throw new ConvexError("Invitation not found.");
    if (inv.status === "accepted") {
      throw new ConvexError(
        "This invitation was already accepted. Manage the user under Active Users instead."
      );
    }
    await ctx.db.patch(invitationId, {
      status: "revoked",
      updatedAt: Date.now(),
    });
  },
});

export const resend = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    await requireAdmin(ctx);
    const inv = await ctx.db.get(invitationId);
    if (!inv) throw new ConvexError("Invitation not found.");
    if (inv.status !== "pending") {
      throw new ConvexError("Only pending invitations can be resent.");
    }
    // Refresh the link validity window on resend.
    await ctx.db.patch(invitationId, {
      expiresAt: Date.now() + daysToMs(DEFAULT_INVITE_VALID_DAYS),
      lastSendError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.email.sendInvitationEmail, {
      invitationId,
    });
  },
});

/* ------------------------------------------------------------------ */
/*  Public: accept flow                                               */
/* ------------------------------------------------------------------ */

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!inv) {
      return { found: false as const };
    }
    const now = Date.now();
    const linkExpired = inv.expiresAt < now;
    return {
      found: true as const,
      email: inv.email,
      status: inv.status,
      linkExpired,
      invitedByEmail: inv.invitedByEmail,
      accessWindowDays: inv.accessWindowDays,
      // Acceptable to surface: the admin-authored welcome message only.
      message: inv.emailBody ?? null,
    };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { userId, email } = await requireUser(ctx);
    if (!email) {
      throw new ConvexError("Your account is missing an email address.");
    }

    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!inv) {
      throw new ConvexError("This invitation link is not valid.");
    }
    if (normalizeEmail(inv.email) !== email) {
      throw new ConvexError(
        "This invitation was issued for a different email address."
      );
    }

    const now = Date.now();

    // If a grant already exists for this user, treat accept as idempotent.
    const existingAccess = await ctx.db
      .query("userAccess")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (inv.status === "accepted" && existingAccess) {
      return { ok: true as const, alreadyAccepted: true as const };
    }
    if (inv.status === "revoked") {
      throw new ConvexError("This invitation has been revoked.");
    }
    if (inv.status === "pending" && inv.expiresAt < now) {
      throw new ConvexError(
        "This invitation link has expired. Ask your administrator to resend it."
      );
    }

    const accessExpiresAt = now + daysToMs(inv.accessWindowDays);

    if (existingAccess) {
      await ctx.db.patch(existingAccess._id, {
        status: "active",
        email,
        invitationId: inv._id,
        accessStartsAt: now,
        accessExpiresAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAccess", {
        userId,
        email,
        invitationId: inv._id,
        status: "active",
        accessStartsAt: now,
        accessExpiresAt,
        grantedByUserId: inv.invitedByUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(inv._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: userId,
      updatedAt: now,
    });

    return { ok: true as const, alreadyAccepted: false as const };
  },
});

/* ------------------------------------------------------------------ */
/*  Internal: used by the email-sending action                        */
/* ------------------------------------------------------------------ */

export const getInvitationInternal = internalQuery({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    return ctx.db.get(invitationId);
  },
});

export const markSendResult = internalMutation({
  args: {
    invitationId: v.id("invitations"),
    sent: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { invitationId, sent, error }) => {
    const inv = await ctx.db.get(invitationId);
    if (!inv) return;
    await ctx.db.patch(invitationId, {
      lastSentAt: sent ? Date.now() : inv.lastSentAt,
      lastSendError: sent ? undefined : error,
      updatedAt: Date.now(),
    });
  },
});
