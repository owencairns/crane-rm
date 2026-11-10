/**
 * Client-side feature flags. `NEXT_PUBLIC_*` vars are inlined at build time, so
 * production simply omits the flag (or sets it to "false") to keep a feature
 * dark, while local dev sets it in `.env.local`.
 */
export const AUDITGUARD_ENABLED =
  process.env.NEXT_PUBLIC_AUDITGUARD_ENABLED === "true"
