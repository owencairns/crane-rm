import { query } from "./_generated/server";
import { getAccessState } from "./lib/access";

/**
 * Current user's access status, used by the client access gate and to decide
 * whether to surface the admin console. Returns a discriminated `state`.
 */
export const myAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        state: "unauthenticated" as const,
        isAdmin: false,
        email: null as string | null,
        expiresAt: null as number | null,
      };
    }
    const result = await getAccessState(ctx);
    return {
      state: result.state,
      isAdmin: result.state === "admin",
      email: result.email,
      expiresAt: result.expiresAt,
    };
  },
});
