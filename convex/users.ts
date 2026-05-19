import { query } from "./_generated/server";
import { isSuperAdminEmail } from "./lib/admin";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      id: identity.subject,
      email: identity.email ?? null,
      name: identity.name ?? null,
      isSuperAdmin: isSuperAdminEmail(identity.email),
    };
  },
});
