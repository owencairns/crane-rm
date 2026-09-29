import { z } from "zod";
import { auditEvidenceSchema } from "./auditGuardSchemas";

/* ------------------------------------------------------------------ */
/*  AuditGuard prompts                                                */
/*                                                                    */
/*  Stage 1 maps a policy package into the canonical extraction shape */
/*  (policyExtractionSchema). A second overseer pass audits the       */
/*  extraction for rating-basis and rate mistakes before we compute.  */
/* ------------------------------------------------------------------ */

export function getPolicyExtractionPrompt(markdown: string): string {
  return `You are a commercial insurance premium auditor reading a construction client's in-force insurance policy package. The package may contain the policy declarations, coverage part schedules, class-code schedules, and endorsements across multiple lines of business.

Your job is to extract, FOR EACH LINE OF BUSINESS, how its premium is rated so we can later project the client's year-end audit true-up.

For every coverage line you find (General Liability, Workers' Compensation, Commercial Auto, Umbrella/Excess, Inland Marine, Builders Risk, etc.):
- lineId: a stable camelCase slug ("generalLiability", "workersComp", "commercialAuto", "umbrella").
- lineOfBusiness: the human label.
- auditable: true if this line is subject to a year-end premium audit (GL, WC, and umbrella that follows them generally ARE; flat-charged lines like a fixed Builders Risk or many Auto policies generally are NOT).
- ratingBasis: how the premium is calculated:
    * "revenue" — per dollar of gross receipts / sales (common for GL).
    * "payroll" — per dollar of payroll (Workers' Comp, sometimes GL).
    * "subcontracted_cost" — per dollar paid to subcontractors (a GL basis).
    * "units" — per discrete unit (per vehicle, etc.).
    * "flat" — a flat charge that is not exposure-rated and not audited.
    * "unknown" — present but the basis cannot be determined from the document.
- ratingBasisLabel: short friendly description, e.g. "Gross receipts (per $1,000)" or "Payroll (per $100)".
- unitSize: the denominator the rate is quoted against. Use 1000 for "per $1,000" (typical GL revenue), 100 for "per $100" (typical WC payroll), and 1 for flat or per-unit lines.
- classCode: the rating class code if one is shown (WC and some GL split exposure across class codes). Null if none.
- classCodeDescription: the class code's description if shown.
- state: the two-letter rating state when the schedule is state-specific (especially Workers' Comp). Use "CA", "AZ", etc. Null if no state is shown for the line.
- ratePerUnit: dollars of premium per unitSize of exposure. If the policy prints a rate, use it ("stated"). If it only prints an estimated exposure and a premium, back the rate into it (premium ÷ (exposure ÷ unitSize)) and mark rateSource "implied". If neither is available, null with rateSource "unknown".
- rateComponents: when the same class/exposure is rated at multiple components (for example General Liability Premises/Operations plus Products/Completed Operations), emit each component as { label, ratePerUnit } and set ratePerUnit to their SUM. Null if there is only one rate or the components are not shown.
- rateSource: "stated" | "implied" | "unknown".
- boundExposure: the ESTIMATED exposure the bound premium was calculated on (the estimated revenue/payroll on the dec page). Null if not shown.
- currentPremium: the annual premium currently charged for this line. Null if not shown.
- premiumModifiers: multiplicative factors printed on rating/declarations pages that apply to this line's manual premium. Examples: EXPERIENCE MODIFICATION 0.75 => factor 0.75; SCHEDULED CREDIT -5.33% => factor 0.9467; large deductible credit -11.13% => factor 0.8887; premium discount; increased employers-liability limits 9812 +2.8% => factor 1.028; waiver of subrogation 0930 +2% => factor 1.02. Include key, label, factor. Null if none are printed. Apply Workers' Comp modifiers only to the WC line/classes unless the document clearly says otherwise.
- confidence: how sure you are about the basis + rate ("high" only when both are explicit on the document).
- assumptions: list every assumption a human should double-check (e.g. "rate implied by dividing premium by estimated payroll", "class code not printed; assumed single carpentry class").
- evidence: tie each key value to its page + a verbatim excerpt.

RULES:
- Never invent a rate, exposure, or class code. Prefer null + a clear assumption over a guess.
- Never invent a premium modifier or factor. Only record modifiers/factors printed in the policy, and cite evidence for each one.
- If a line lists multiple class codes (common for WC), emit ONE policy line PER class code, each with its own rate, exposure, and code.
- Workers' Comp is rated on PAYROLL, not revenue. Do not record revenue as the WC basis.
- If a policy shows a minimum premium and expense constant on the declarations/rating pages, capture policy-level minimumPremium and expenseConstant. Otherwise use null.
- Capture the client/named insured name and the policy period.

POLICY PACKAGE:
${markdown}`;
}

/* ------------------------------------------------------------------ */
/*  Overseer — audits the stage-1 extraction                          */
/* ------------------------------------------------------------------ */

export const auditGuardOverseerCorrectionSchema = z.object({
  action: z.enum(["update", "add"]),
  lineId: z.string(),
  field: z.string(),
  // The corrected value, JSON-encoded (numbers as strings are fine).
  correctedValue: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
  evidence: z.array(auditEvidenceSchema),
});

export const auditGuardOverseerResultSchema = z.object({
  corrections: z.array(auditGuardOverseerCorrectionSchema),
});

export type AuditGuardOverseerResult = z.infer<
  typeof auditGuardOverseerResultSchema
>;

export function getPolicyOverseerPrompt(
  extractionJson: string,
  markdown: string
): string {
  return `You are a senior premium-audit reviewer auditing a junior analyst's structured extraction of an insurance policy package. Catch mistakes that would distort a year-end audit estimate.

Focus on the errors that matter most:
- Wrong rating basis (e.g. Workers' Comp recorded as revenue-rated instead of payroll-rated, or a flat line marked auditable).
- Wrong unitSize (per $100 vs per $1,000 confusion).
- A rate that is off by an order of magnitude, or an "implied" rate that doesn't reconcile with the stated premium and exposure.
- A missing or wrong boundExposure when the document prints an estimated exposure or estimated premium for that line — boundExposure ÷ unitSize × ratePerUnit should approximately equal the line's printed estimated premium. If the dec prints an estimated exposure the extraction left null, correct it.
- A line that should be split across class codes but was collapsed into one.
- Missing state on multi-state Workers' Comp class lines.
- Missing GL rate components when Premises/Operations and Products/Completed Operations are separately rated on the same exposure.
- Missing printed premium modifiers such as experience mod, schedule credit/debit, deductible credit, premium discount, increased employers-liability limits, or waiver of subrogation.
- "auditable" set incorrectly.

For an "auditable" correction, the evidence you cite must explicitly and unambiguously support the NEW value you propose. Before proposing it, re-read your own cited evidence. If it mentions an audit period, "subject to audit", an audit basis, or similar audit language, DO NOT set auditable to false. Only flip auditable to false when the evidence affirmatively shows a flat/non-audited charge (for example, "flat annual charge" with no audit provision). Never set it to false based on an assumed policy type or general industry expectations.

Only propose a correction when the document clearly supports it. For each correction give the lineId, the field to change, the corrected value (JSON-encoded), your confidence, reasoning, and page-cited evidence. If the extraction is sound, return an empty corrections array.

EXTRACTION (JSON):
${extractionJson}

POLICY PACKAGE (source of truth):
${markdown}`;
}
