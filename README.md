# Red Cedar construction risk suite

AI tools Red Cedar offers its construction clients. Live at
[tools.redcedaragency.com](https://tools.redcedaragency.com) (also `contractredliner.app`).

| Tool | Route | What it does |
| --- | --- | --- |
| Redline | `/redliner`, `/contracts/[id]` | Reviews a subcontract PDF against the provision catalog and flags risky clauses |
| SubProtect | `/sub-protect` | Checks a certificate of insurance package against the insurance requirements |
| AuditGuard | `/audit-guard` | Premium audit review (hidden unless `NEXT_PUBLIC_AUDITGUARD_ENABLED=true`) |
| Threshold calculator | `/threshold-calculator` | WCIRB dual-wage threshold lookup |
| Admin | `/admin` | Invitations, access windows, invite email template |

## Stack

- Next.js 16 (app router) on Vercel, project `crane-rm-frontend`
- Convex for data, file storage, auth and background actions, project `crane-rm-redline`
  (prod `limitless-dinosaur-363`, dev `brave-hamster-906`)
- Better Auth (email and password, invitation only)
- OpenAI for analysis, Mistral for PDF OCR, Brevo for invite email

## Local setup

```bash
npm install
npm run dev        # Next on :3000 and `convex dev` together
```

`.env.local` needs `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and
`NEXT_PUBLIC_CONVEX_SITE_URL` (written by `npx convex dev`). Server secrets live on the
Convex deployment (`npx convex env list`): `OPENAI_API_KEY`, `MISTRAL_API_KEY`,
`BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `INVITE_EMAIL_FROM`, `SITE_URL`,
`SUPER_ADMIN_EMAILS` / `ADMIN_EMAILS`, optional `OPENAI_ANALYSIS_MODEL` and
`OPENAI_COI_OVERSEER_MODEL`.

## Shipping a change

`main` is production. Work on a branch and open a PR.

1. CI (`.github/workflows/ci.yml`) runs typecheck and lint on every PR.
2. Vercel builds a preview for every pushed branch. Check it from the PR.
3. If the change touches `convex/`, deploy the backend before merging, since Vercel
   does not deploy Convex:

   ```bash
   npx convex deploy        # pushes convex/ to prod limitless-dinosaur-363
   ```

   Keep backend changes backward compatible (new schema fields optional) so the live
   frontend keeps working in the gap.
4. Merge the PR. Vercel deploys `main` to production.

Roll back the frontend by promoting the previous production deployment in the Vercel
dashboard. Roll back Convex by checking out the previous commit and running
`npx convex deploy` again.

## Adjusting Redline findings

- Provision wording, priority, definitions and search hints:
  `convex/data/provisions.json`. Bump `catalogVersion` in
  `convex/lib/analysisConfig.ts` when you change it.
- Agent instructions: `convex/lib/prompts.ts`.
- Trade-specific rules applied in code: `convex/lib/provisions.ts`. Today that is the
  "Subcontractor" label rule. Crane companies should be called "Service Provider",
  scaffold companies "Equipment Provider", and every other trade is correctly a
  "Subcontractor", so the finding does not fire for them. Change the labels in
  `PROVIDER_LABELS`, and the trade list in `ProviderType` (`convex/lib/types.ts`) plus
  the `providerType` enum on `record_finding` (`convex/contractNode.ts`).

Changes apply to new analyses only. Existing results keep the findings they were
saved with, so re-upload a contract to see a new rule on it.

## Checks

```bash
npx tsc --noEmit
npm run lint
```
