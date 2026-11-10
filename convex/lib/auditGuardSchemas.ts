import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  AuditGuard — premium-audit estimation schemas                     */
/*                                                                    */
/*  AuditGuard reads a client's in-force construction insurance       */
/*  policies and works out, per line of business, how the premium is  */
/*  rated (revenue, payroll, etc.), the rate per unit, and the        */
/*  exposure the premium was bound on. From that it can project the   */
/*  additional premium a client should expect at year-end audit if    */
/*  their actual revenue / payroll comes in higher than estimated.    */
/*                                                                    */
/*  Stage 1 (LLM): policies → PolicyExtraction (this file's schema).  */
/*  Stage 2 (deterministic, see auditGuardCompute): extraction +      */
/*  user-supplied financials → per-line estimate.                     */
/* ------------------------------------------------------------------ */

// Ties an extracted value back to the source policy page.
export const auditEvidenceSchema = z.object({
  field: z.string(),
  page: z.number().int(),
  excerpt: z.string(),
});

// How a line of business is rated. The "exposure base" the carrier
// multiplies by a rate to arrive at premium.
export const ratingBasisEnum = z.enum([
  "revenue", // GL, umbrella — per $X of gross receipts/sales
  "payroll", // WC, sometimes GL — per $X of payroll
  "subcontracted_cost", // GL — per $X paid to subcontractors
  "units", // per unit (e.g. per vehicle, per unit of admissions)
  "flat", // flat-charged, not exposure-rated / not audited
  "unknown", // basis could not be determined from the document
]);

// One line of business extracted from the policy package.
export const policyLineSchema = z.object({
  // Stable slug, e.g. "generalLiability", "workersComp", "umbrella".
  lineId: z.string(),
  // Human label, e.g. "General Liability", "Workers' Compensation".
  lineOfBusiness: z.string(),
  policyNumber: z.string().nullable(),
  carrier: z.string().nullable(),
  // Whether this line is subject to a year-end premium audit at all.
  auditable: z.boolean(),
  ratingBasis: ratingBasisEnum,
  // Friendly description of the basis, e.g. "Gross receipts (per $1,000)".
  ratingBasisLabel: z.string(),
  // Denominator the rate is quoted against: 1000 for "per $1,000",
  // 100 for "per $100" (typical WC payroll), 1 for flat/per-unit.
  unitSize: z.number(),
  // WC and some GL split exposure across class codes.
  classCode: z.string().nullable(),
  classCodeDescription: z.string().nullable(),
  // Two-letter rating state when the schedule is state-specific, especially
  // for multi-state Workers' Comp policies with repeated class codes.
  state: z.string().nullable(),
  // Dollars of premium per `unitSize` of exposure. Null if not derivable.
  ratePerUnit: z.number().nullable(),
  // When a single class has multiple rating components on the same exposure
  // (e.g. GL Premises/Ops + Products/Completed Ops), ratePerUnit should be
  // the sum and these components preserve the carrier's breakdown.
  rateComponents: z
    .array(
      z.object({
        label: z.string(),
        ratePerUnit: z.number(),
      })
    )
    .nullable(),
  // Whether the rate was printed on the policy ("stated") or backed into
  // from premium / exposure ("implied"), or could not be found.
  rateSource: z.enum(["stated", "implied", "unknown"]),
  // The estimated exposure the bound premium was calculated on.
  boundExposure: z.number().nullable(),
  // The annual premium currently charged for this line.
  currentPremium: z.number().nullable(),
  // Multiplicative factors that apply to this line's manual premium.
  // Examples: e-mod 0.75, schedule credit 0.9467, increased limits 1.028.
  premiumModifiers: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        factor: z.number(),
      })
    )
    .nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  // Plain-language caveats the analyst should surface to the client.
  assumptions: z.array(z.string()),
  notes: z.string().nullable(),
  evidence: z.array(auditEvidenceSchema),
});

export const policyExtractionSchema = z.object({
  clientName: z.string().nullable(),
  policyPeriod: z
    .object({
      effective: z.string().nullable(),
      expiration: z.string().nullable(),
    })
    .nullable(),
  minimumPremium: z.number().nullable(),
  expenseConstant: z.number().nullable(),
  lines: z.array(policyLineSchema),
});

export type PolicyLine = z.infer<typeof policyLineSchema>;
export type PolicyExtraction = z.infer<typeof policyExtractionSchema>;
export type RatingBasis = z.infer<typeof ratingBasisEnum>;

/* ------------------------------------------------------------------ */
/*  Derived (non-LLM) shapes shared by server + client                */
/* ------------------------------------------------------------------ */

// A single financial figure AuditGuard needs the user to supply, derived
// from what the policies are rated on. This is the "upload this here,
// enter that there" checklist that drives stage 2.
export interface FinancialInputRequest {
  // Stable key the user's value is stored under, e.g. "revenue" or
  // "payroll:5403". Lines that consume the same exposure share a key.
  key: string;
  label: string;
  basis: RatingBasis;
  classCode: string | null;
  state: string | null;
  unit: "dollars" | "count";
  // Line ids that this figure feeds into.
  appliesToLineIds: string[];
  helpText?: string;
}

export interface FinancialInputValue {
  amount: number;
  // Months of data the amount covers (for example, 7 for August–February).
  // Absent means the amount is already a full-year figure.
  monthsCovered?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export type FinancialInputs = Record<
  string,
  number | FinancialInputValue
>;

// Per-line estimate result after the deterministic compute step.
export interface LineEstimate {
  lineId: string;
  // estimated | needs_input | insufficient_data | not_auditable
  status: "estimated" | "needs_input" | "insufficient_data" | "not_auditable";
  inputKey: string | null;
  rawExposure: number | null;
  projectedExposure: number | null;
  annualized: boolean;
  additionalExposure: number | null;
  additionalPremium: number | null;
  projectedPremium: number | null;
  reasoning: string;
}

export interface EstimateSummary {
  lineCount: number;
  estimatedLineCount: number;
  totalCurrentPremium: number | null;
  totalProjectedPremium: number | null;
  totalAdditionalPremium: number | null;
  premiumFloor: number | null;
  floorApplied: boolean;
  floorReasoning: string | null;
}
