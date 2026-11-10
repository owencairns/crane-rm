/**
 * Pure (no server / no Node deps) renderer for the invitation email.
 *
 * This module is imported BOTH by the Convex send action (`convex/email.ts`)
 * and by the admin UI's live preview (`app/(authenticated)/admin`), so the
 * preview an admin sees is byte-for-byte what the recipient gets.
 *
 * Brand: Red Cedar Insurance Agency — blue (#005A7A) / white / green (#52632D).
 */

/** The built-in default template, used until an admin saves their own. */
export const INVITE_EMAIL_DEFAULTS = {
  subject: "You've been invited to the Red Cedar Suite",
  body: `You've been invited to the **Red Cedar Suite** — construction risk management tools for contract review and certificate verification.

Click the button below to set your password and get started. Your access is valid for {{access_days}} days from the moment you join.`,
} as const;

/** Placeholders an admin may use in the subject or body. */
export const INVITE_PLACEHOLDERS: Array<{ token: string; description: string }> = [
  { token: "{{invite_url}}", description: "the recipient's unique accept link" },
  { token: "{{inviter}}", description: "the admin who sent the invite" },
  { token: "{{access_days}}", description: "length of the access window in days" },
];

export interface InviteEmailVars {
  inviteUrl: string;
  inviter: string;
  accessDays: number;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyPlaceholders(template: string, vars: InviteEmailVars): string {
  return template
    .replaceAll("{{invite_url}}", vars.inviteUrl)
    .replaceAll("{{inviter}}", vars.inviter)
    .replaceAll("{{access_days}}", String(vars.accessDays));
}

/**
 * Turn an admin-authored plain-text body into safe HTML paragraphs.
 * Supports blank-line paragraph breaks, single-line `<br/>`, and a light
 * `**bold**` convenience so admins can emphasize without writing HTML.
 */
function bodyToHtml(body: string, vars: InviteEmailVars): string {
  const withVars = applyPlaceholders(body.trim(), vars);
  return withVars
    .split(/\n{2,}/)
    .map((para) => {
      const safe = escapeHtml(para).replaceAll("\n", "<br/>");
      const bolded = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return `<p style="margin:0 0 16px;">${bolded}</p>`;
    })
    .join("");
}

export interface RenderInviteEmailOpts {
  inviteUrl: string;
  inviter: string;
  accessDays: number;
  /** Plain-text body (with placeholders / **bold**). Falls back to default. */
  body?: string;
  /** Absolute URL to the RCIA logo PNG (email clients won't render SVG). */
  logoUrl: string;
}

/** Brand palette. */
const BLUE = "#005A7A";
const GREEN = "#52632D";

/**
 * Render the full branded invitation email HTML. Table-based + inline styles
 * for maximum email-client compatibility (Gmail, Outlook, Apple Mail).
 */
export function renderInvitationEmailHtml(opts: RenderInviteEmailOpts): string {
  const vars: InviteEmailVars = {
    inviteUrl: opts.inviteUrl,
    inviter: opts.inviter,
    accessDays: opts.accessDays,
  };
  const intro = bodyToHtml(
    opts.body?.trim() ? opts.body : INVITE_EMAIL_DEFAULTS.body,
    vars
  );

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#eef2f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b2a31;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f4;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,42,55,0.08);">
            <!-- Blue accent bar -->
            <tr><td style="height:6px;background:${BLUE};line-height:6px;font-size:6px;">&nbsp;</td></tr>
            <!-- Logo header on white -->
            <tr>
              <td align="center" style="padding:32px 32px 12px;">
                <img src="${opts.logoUrl}" alt="Red Cedar Insurance Agency" width="200" style="display:block;width:200px;max-width:60%;height:auto;" />
              </td>
            </tr>
            <!-- Divider -->
            <tr>
              <td style="padding:0 32px;">
                <div style="height:1px;background:#e3eaed;line-height:1px;font-size:1px;">&nbsp;</div>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:24px 32px 8px;font-size:15px;line-height:1.65;color:#36474f;">
                ${intro}
              </td>
            </tr>
            <!-- CTA -->
            <tr>
              <td style="padding:8px 32px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:${GREEN};">
                      <a href="${opts.inviteUrl}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:8px;">Accept invitation</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#90a2aa;">
                  If the button doesn't work, paste this link into your browser:<br/>
                  <a href="${opts.inviteUrl}" style="color:${BLUE};word-break:break-all;">${opts.inviteUrl}</a>
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px;background:#f6f9fa;border-top:1px solid #e3eaed;font-size:12px;line-height:1.5;color:#7c8d95;">
                <strong style="color:${BLUE};">Red Cedar Suite</strong> &middot; by Red Cedar Insurance Agency<br/>
                Invited by ${escapeHtml(opts.inviter)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
