# Agent notes

Read `README.md` first. It covers the tools, stack, deploy flow and where rules live.

- `main` is production: Vercel deploys it automatically. Never push straight to `main`;
  open a PR so CI and the Vercel preview run.
- Vercel does not deploy Convex. A change under `convex/` needs `npx convex deploy`
  before the PR merges, and schema changes must stay backward compatible.
- After changing `convex/data/provisions.json`, bump `catalogVersion` in
  `convex/lib/analysisConfig.ts`.
- Run `npx tsc --noEmit` and `npm run lint` before pushing. Both must be clean.
