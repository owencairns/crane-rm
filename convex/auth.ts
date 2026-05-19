import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { query, type ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { isSuperAdminEmail } from "./lib/admin";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  process.env.CONVEX_DEPLOYMENT ??
  "local-dev-better-auth-secret-change-me";
const useSecureCookies = siteUrl.startsWith("https://");
const siteHost = (() => {
  try {
    return new URL(siteUrl).host;
  } catch {
    return "localhost:3000";
  }
})();
const extraAllowedHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const localAllowedHosts = [
  siteHost,
  ...extraAllowedHosts,
  "localhost:*",
  "127.0.0.1:*",
  "10.0.0.*:*",
  "192.168.*:*",
];

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const pendingInviteByEmail = new Map<string, string>();
  return betterAuth({
    baseURL: {
      allowedHosts: localAllowedHosts,
      fallback: siteUrl,
    },
    secret: authSecret,
    database: authComponent.adapter(ctx),
    advanced: {
      useSecureCookies,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    hooks: {
      before: createAuthMiddleware(async (mw) => {
        if (mw.path !== "/sign-up/email") return;
        const body = mw.body as { email?: string; inviteToken?: string } | undefined;
        if (!body?.email) return;
        const inviteToken = body.inviteToken;
        // Strip from body so it never reaches the database adapter (the
        // Convex better-auth user table has a strict validator that rejects
        // unknown fields).
        delete body.inviteToken;

        if (isSuperAdminEmail(body.email)) return;

        if (!inviteToken) {
          throw new APIError("BAD_REQUEST", {
            message: "Sign-up is invite-only. A valid invite link is required.",
          });
        }

        try {
          await (ctx as ActionCtx).runQuery(internal.invites.assertValidForSignup, {
            token: inviteToken,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Invalid invite";
          throw new APIError("BAD_REQUEST", { message });
        }

        pendingInviteByEmail.set(body.email, inviteToken);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const inviteToken = pendingInviteByEmail.get(user.email);
            if (!inviteToken) return;
            pendingInviteByEmail.delete(user.email);
            try {
              await (ctx as ActionCtx).runMutation(internal.invites.consumeForSignup, {
                token: inviteToken,
                email: user.email,
              });
            } catch {
              // User is already created; swallow to avoid leaving the
              // account inaccessible. The invite may already be consumed
              // by a concurrent signup — that's acceptable.
            }
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export const { getAuthUser } = authComponent.clientApi();
