import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  INVITE_EMAIL_DEFAULTS,
  renderInvitationEmailHtml,
} from "./lib/inviteEmail";

/**
 * Invitation email delivery via Brevo's transactional REST API. Runs in the
 * default Convex runtime (fetch is available) — no Node action needed.
 *
 * Env:
 *   BREVO_API_KEY       — required to actually send (REST api-key, not the SMTP key).
 *   INVITE_EMAIL_FROM   — sender, e.g. "Red Cedar Suite <noreply@contractredliner.app>"
 *                         (the email must be a verified Brevo sender/domain).
 *   SITE_URL            — base URL for the accept link.
 *
 * If BREVO_API_KEY is missing the send is skipped (logged loudly) but the
 * invitation still exists, so an admin can copy the link from the console.
 */

/** Parse "Name <email@host>" (or a bare email) into Brevo's sender shape. */
function parseSender(raw: string): { email: string; name?: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^"|"$/g, "").trim();
    return { email: match[2].trim(), name: name || undefined };
  }
  return { email: raw.trim() };
}

export const sendInvitationEmail = internalAction({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    const inv = await ctx.runQuery(
      internal.invitations.getInvitationInternal,
      { invitationId }
    );
    if (!inv) return;

    const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(
      /\/$/,
      ""
    );
    const inviteUrl = `${siteUrl}/accept-invite?token=${inv.token}`;

    // Resolution order: per-invitation override → saved admin template →
    // built-in default.
    const template = await ctx.runQuery(internal.emailTemplate.getInternal, {});
    const subject =
      inv.emailSubject?.trim() ||
      template?.subject ||
      INVITE_EMAIL_DEFAULTS.subject;
    const body = inv.emailBody?.trim() || template?.body || undefined;

    const html = renderInvitationEmailHtml({
      inviteUrl,
      inviter: inv.invitedByEmail || "Red Cedar",
      accessDays: inv.accessWindowDays,
      body,
      logoUrl: `${siteUrl}/red-cedar-logo.png`,
    });

    const apiKey = process.env.BREVO_API_KEY;
    const sender = parseSender(
      process.env.INVITE_EMAIL_FROM ?? "Red Cedar Suite <noreply@contractredliner.app>"
    );

    if (!apiKey) {
      console.error(
        `[invitations] BREVO_API_KEY not set — email to ${inv.email} not sent. Invite URL: ${inviteUrl}`
      );
      await ctx.runMutation(internal.invitations.markSendResult, {
        invitationId,
        sent: false,
        error: "BREVO_API_KEY not configured",
      });
      return;
    }

    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: inv.email }],
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(
          `[invitations] Brevo send failed (${res.status}): ${body}`
        );
        await ctx.runMutation(internal.invitations.markSendResult, {
          invitationId,
          sent: false,
          error: `Brevo ${res.status}`,
        });
        return;
      }
      await ctx.runMutation(internal.invitations.markSendResult, {
        invitationId,
        sent: true,
      });
    } catch (err) {
      console.error("[invitations] Brevo send threw:", err);
      await ctx.runMutation(internal.invitations.markSendResult, {
        invitationId,
        sent: false,
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  },
});
