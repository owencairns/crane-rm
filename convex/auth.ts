import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { APIError } from "better-auth/api";
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
const localAllowedHosts = [
  siteHost,
  "localhost:*",
  "127.0.0.1:*",
  "10.0.0.*:*",
  "192.168.*:*",
];

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
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
    user: {
      additionalFields: {
        inviteToken: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const incoming = user as typeof user & { inviteToken?: string };
            const inviteToken = incoming.inviteToken;
            const { inviteToken: _omit, ...userToSave } = incoming;

            if (isSuperAdminEmail(user.email)) {
              return { data: userToSave };
            }

            if (!inviteToken) {
              throw new APIError("BAD_REQUEST", {
                message: "Sign-up is invite-only. A valid invite link is required.",
              });
            }

            try {
              await (ctx as ActionCtx).runMutation(internal.invites.consumeForSignup, {
                token: inviteToken,
                email: user.email,
              });
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Invalid invite";
              throw new APIError("BAD_REQUEST", { message });
            }

            return { data: userToSave };
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export const { getAuthUser } = authComponent.clientApi();
