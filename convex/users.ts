import { query } from "./_generated/server";
import { getCallerRole } from "./lib/admin";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const role = await getCallerRole(ctx);
    if (!role) return null;
    return {
      id: role.identity.subject,
      email: role.identity.email ?? null,
      name: role.identity.name ?? null,
      isAdmin: role.isAdmin,
      isSuperAdmin: role.isSuperAdmin,
    };
  },
});
