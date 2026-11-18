# Red Cedar construction risk suite

AI tools Red Cedar offers its construction clients. Live at
[tools.redcedaragency.com](https://tools.redcedaragency.com) (also `contractredliner.app`).

| Tool | Route | What it does |
| --- | --- | --- |
| Redline | `/redliner`, `/contracts/[id]` | Reviews a subcontract PDF against the provision catalog and flags risky clauses |
| SubProtect | `/sub-protect` | Checks a certificate of insurance package against the insurance requirements |
| AuditGuard | `/audit-guard` | Premium audit review (hidden unless `NEXT_PUBLIC_AUDITGUARD_ENABLED=true`) |
| Threshold calculator | `/threshold-calculator` | WCIRB dual-wage threshold lookup |
| CertMaster (for agents) | `/certmaster` | Reads a contract and drafts an EXAMPLE ACORD 25 with the minimum limits and Red Cedar remarks wording. Agency staff only |
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
`SUPER_ADMIN_EMAILS` / `ADMIN_EMAILS`, optional `OPENAI_ANALYSIS_MODEL`,
`OPENAI_COI_OVERSEER_MODEL` and `AGENT_EMAIL_DOMAINS` (who sees the "For agents"
tools besides admins; defaults to `redcedaragency.com`).

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

## Adjusting CertMaster

CertMaster (`convex/certRequests.ts`, `convex/certRequestNode.ts`) runs OCR, two parallel
extraction calls, then fills `convex/lib/certmaster/acord25Template.ts`.

- Description of operations wording: `convex/lib/certmaster/remarks.ts`. Sentences follow
  Red Cedar's Certificate Issuance Guidelines; only names, policy labels and the project
  are filled in from the contract.
- Which form boxes get filled and how: `convex/lib/certmaster/filler.ts`. ADDL INSD and
  SUBR WVD are text fields that take "Y"; checkboxes are drawn as X marks after the form
  is flattened. Producer block constants live at the top.
- Extraction instructions: `convex/lib/certmaster/prompts.ts`.
- "Before you issue" checks and quote verification: `convex/lib/certmaster/assemble.ts`.

Agents can fix the insured, holder and project in the UI; that re-fills the PDF without
new AI calls.

CertMaster is one shared agency workspace, like the standalone app's org queue: every
agent sees every request, with who uploaded it, an activity trail, and archive. Only the
uploader or an admin can delete. Documents up to 12 pages also go to the model as the
original PDF so it can read checkboxes on scans and sample certificates.

## Checks

```bash
npx tsc --noEmit
npm run lint
```
