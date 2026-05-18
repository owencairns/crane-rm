import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  process.env.CONVEX_DEPLOYMENT ??
  "local-dev-better-auth-secret-change-me";
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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
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
