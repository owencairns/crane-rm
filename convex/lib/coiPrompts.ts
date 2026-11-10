import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Extraction prompts                                                */
/*                                                                    */
/*  Both the requirements document and the COI are mapped into the    */
/*  same canonical ACORD-25 shape (acord25RequirementsSchema). The    */
/*  only difference is what the numbers MEAN:                         */
/*    - requirements doc → the REQUIRED minimums / mandates           */
/*    - COI              → the ACTUAL coverage in force               */
/* ------------------------------------------------------------------ */

export function getRequirementsExtractionPrompt(markdown: string): string {
  return `You are an insurance analyst extracting the insurance REQUIREMENTS a vendor/subcontractor must satisfy, from a contract or requirements exhibit.

Read the document and fill the structured schema with what is REQUIRED:
- For each coverage line, set "required" true only if the document actually demands that coverage.
- Limits are the REQUIRED MINIMUMS (e.g. "$1,000,000 each occurrence" → eachOccurrence: 1000000). Use plain numbers, no separators. Null when not specified.
- addlInsured / subrogationWaived / primaryNoncontributory etc. are true only when the document explicitly requires them.
- Put every demand that doesn't map to a structured field into specialRequirements (with the page and a verbatim excerpt). This INCLUDES any required minimum carrier financial-strength / AM Best rating (e.g. "carriers must be rated A- VII or better") — capture the exact rating text verbatim.
- Leave "insurers" as an empty array; a requirements document does not list the carriers affording coverage.
- For each value you extract, add an evidence entry tying it to the source page + excerpt.
- Never invent a requirement. If something is not stated, leave it null/false.
- HARD EXCLUSION: completely ignore disability insurance, unemployment insurance, unemployment compensation, state disability, paid family leave, payroll taxes, and government benefit / statutory benefit programs. Do not put them in specialRequirements. SubProtect only reviews insurance requirements that would need to appear on a certificate of insurance or attached cert package. Workers compensation and employers liability are in scope; disability and unemployment are not.

DOCUMENT:
${markdown}`;
}

export function getCoiExtractionPrompt(markdown: string): string {
  return `You are an insurance analyst reading a Certificate of Insurance package and extracting the coverage that is ACTUALLY in force. The package may contain the ACORD 25 certificate plus attached endorsements, schedules, or policy forms.

Read the full package and fill the structured schema with what the COI package SHOWS:
- For each coverage line, set "required" true if the package actually evidences that coverage (here "required" simply means "present in the certificate package").
- Limits are the ACTUAL limits shown on the cert (e.g. "EACH OCCURRENCE $1,000,000" → eachOccurrence: 1000000). Plain numbers. Null when blank.
- addlInsured / subrogationWaived / primaryNoncontributory are true only when the cert, Description of Operations, or attached endorsements actually indicate them. Be precise about checkbox state and attached form language.
- If the ACORD face says endorsements are attached, read those attachments too. Use notes/evidence to identify form numbers, line of coverage, policy number alignment, blanket vs scheduled wording, and whether the endorsement applies to GL, auto, umbrella, or another line.
- Capture the named insured and certificate holder.
- Populate "insurers" from the "INSURERS AFFORDING COVERAGE" table: one entry per insurer letter (A–F) that is listed, with letter, the carrier's full legal name exactly as shown, and the NAIC # when present (null if blank). Skip empty rows.
- Add evidence entries tying each value to its page + excerpt.
- Do not assume coverage that isn't shown. A blank box is not coverage.

CERTIFICATE PACKAGE:
${markdown}`;
}

/* ------------------------------------------------------------------ */
/*  Review (cross-examination) prompt + output schema                 */
/* ------------------------------------------------------------------ */

export const evidenceCitationSchema = z.object({
  documentName: z
    .string()
    .nullable()
    .describe("name of the source PDF when known"),
  page: z.number().int().nullable().describe("1-based page number when known"),
  excerpt: z.string().describe("verbatim source text"),
});

export const coiFindingSchema = z.object({
  itemId: z
    .string()
    .describe(
      'stable id, e.g. "generalLiability.eachOccurrence" or "special.1"',
    ),
  category: z
    .string()
    .describe(
      'e.g. "General Liability", "Auto Liability", "Workers Comp", "Umbrella/Excess", "Endorsements", "Special"',
    ),
  label: z.string().describe('human-friendly, e.g. "Each Occurrence Limit"'),
  priority: z.enum(["critical", "high", "medium", "low"]),
  requirementSource: z
    .enum([
      "requirements_document",
      "baseline_check",
      "non_coi_requirement",
      "non_contract_source",
    ])
    .describe(
      "where the row comes from: actual requirements contract, default SubProtect sanity check, non-COI requirement, or a bid/proposal/draft/non-contract source that needs human source-authority review",
    ),
  status: z.enum([
    "met",
    "partial",
    "missing",
    "needs_verification",
    "not_applicable",
  ]),
  requiredValue: z
    .string()
    .nullable()
    .describe("what the requirements demand, human-readable"),
  foundValue: z
    .string()
    .nullable()
    .describe("what the COI actually shows, human-readable"),
  reasoning: z.string().describe("why this verdict — one or two sentences"),
  recommendedAction: z
    .string()
    .nullable()
    .describe("what the broker should do if not met"),
  requirementEvidenceExcerpts: z
    .array(z.string())
    .describe(
      "verbatim snippets from the requirements document proving that this requirement was demanded; empty for baseline checks",
    ),
  requirementCitations: z
    .array(evidenceCitationSchema)
    .describe(
      "structured citations into the requirements document: document name, page, excerpt",
    ),
  coiEvidenceExcerpts: z
    .array(z.string())
    .describe("verbatim snippets from the COI supporting the foundValue"),
  coiCitations: z
    .array(evidenceCitationSchema)
    .describe(
      "structured citations into the COI package or attached forms: document name, page, excerpt",
    ),
});

export const coiReviewResultSchema = z.object({
  findings: z.array(coiFindingSchema),
});

export type CoiReviewResult = z.infer<typeof coiReviewResultSchema>;

export const coiOverseerCorrectionSchema = z.object({
  action: z
    .enum(["update", "add"])
    .describe("update an existing finding or add a missing material finding"),
  itemId: z
    .string()
    .describe(
      "stable finding id to update, or new stable id for an added finding",
    ),
  category: z.string().nullable(),
  label: z.string().nullable(),
  priority: z.enum(["critical", "high", "medium", "low"]).nullable(),
  requirementSource: z
    .enum([
      "requirements_document",
      "baseline_check",
      "non_coi_requirement",
      "non_contract_source",
    ])
    .nullable(),
  status: z
    .enum(["met", "partial", "missing", "needs_verification", "not_applicable"])
    .nullable(),
  requiredValue: z.string().nullable(),
  foundValue: z.string().nullable(),
  reasoning: z
    .string()
    .describe("replacement reasoning that explains the correction"),
  recommendedAction: z.string().nullable(),
  requirementCitations: z
    .array(evidenceCitationSchema)
    .describe("requirement-side evidence proving the correction"),
  coiCitations: z
    .array(evidenceCitationSchema)
    .describe("COI/package-side evidence proving the correction"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const coiOverseerResultSchema = z.object({
  corrections: z.array(coiOverseerCorrectionSchema),
});

export type CoiOverseerResult = z.infer<typeof coiOverseerResultSchema>;

export function getReviewPrompt(
  requiredCoverageJson: string,
  actualCoverageJson: string,
  requirementsFilename: string,
  requirementsMarkdown: string,
  coiMarkdown: string,
): string {
  return `You are a commercial insurance broker verifying that a subcontractor's Certificate of Insurance satisfies the insurance requirements of a contract.

You are given two structured extractions in the SAME canonical schema:
1. REQUIRED — what the contract requires.
2. ACTUAL — what the certificate of insurance evidences.

Plus the raw requirements text and raw COI text for citing evidence.

Requirements source PDF name: ${requirementsFilename}

For EVERY requirement present in REQUIRED (each required coverage line's limits, each required endorsement like additional insured / waiver of subrogation / primary & non-contributory, and each special requirement), emit exactly one finding.

Hard exclusions: never emit a finding for disability insurance, unemployment insurance, unemployment compensation, state disability, paid family leave, payroll taxes, or government benefit / statutory benefit programs, even if they appear in REQUIRED or the raw requirements text. They are outside SubProtect because they do not belong on a certificate of insurance. Workers compensation and employers liability remain in scope because they do appear on certificates.

Also emit baseline SubProtect checks even when the requirements document is silent. These are not contract requirements; they are default COI sanity checks:
- Named insured / subcontractor identity is shown and appears to match the vendor/subcontractor identified in the REQUIRED extraction or requirements text.
- Certificate holder is shown and appears to match the requestor/owner/GC/certificate holder identified in the REQUIRED extraction or requirements text. Do not mark this met merely because the COI is internally consistent.
- Project name, job number, and location shown in the COI appear to match the project/location identified in the REQUIRED extraction or requirements text. A different owner, address, or project is a critical mismatch even if the coverage lines look good.
- Policy effective/expiration dates are shown and the certificate does not appear expired.
- Carrier, policy number, and coverage line details are legible enough to support the review.
- If the certificate refers to attached endorsements or forms, the attachments are included in the COI package and can be tied back to the correct insured, policy, and coverage line.

Status rules:
- status "met": the COI clearly satisfies it (e.g. actual limit ≥ required limit; required endorsement is present).
- status "partial": coverage exists but is insufficient (e.g. actual limit < required limit).
- status "missing": the COI does not evidence it at all.
- status "needs_verification": use this only for manual-review classes:
  1. The requirement appears to come from an initial bid document, proposal, quote, draft, instructions to bidders, solicitation, RFP/RFQ, pre-bid document, sample/specimen language, or any other source that is not the actual executed requirements contract. In that case the issue is source authority: a human should confirm whether the requirement is binding before treating it as a COI defect.
  2. The requirement is an insurance carrier financial strength / AM Best rating requirement (for example "carrier must be A- VII or better"). Carrier ratings are usually not shown on a COI, so flag for manual review instead of marking the certificate missing or wrong.
- status "not_applicable": the extracted item is not something a COI can or should prove, such as licensing, OSHA compliance programs, or other non-insurance administrative obligations. Do not punish the COI for these; explain that they should be handled outside SubProtect. Do not use not_applicable for disability or unemployment items; those should be ignored entirely and omitted from findings.

Rules:
- Compare numeric limits as numbers. Umbrella/excess limits may stack on underlying coverage to meet a required limit — note this in reasoning when relevant.
- When a requirement names a specific endorsement/form or requires "equivalent" wording, verify the attached form itself when available. Do not rely solely on an ACORD checkbox or "see attached" note.
- For GL additional insured, completed operations, waiver of subrogation, primary/non-contributory, and per-project/per-location aggregate requirements, confirm the attached GL form or blanket endorsement applies to the right policy/insured and has the required scope.
- For auto additional insured, waiver of subrogation, scheduled/hired/non-owned/any-auto requirements, confirm the attached auto form or schedule applies to the auto policy line. A GL endorsement does not satisfy an auto requirement, and an auto form does not satisfy GL.
- If the actual requirements contract demands an attached form and the COI package does not include it, use "missing" even if the certificate indicates coverage may exist. Do not use "needs_verification" for missing/ambiguous COI evidence.
- Do not create a requirements_document finding solely because the COI shows a coverage feature or attached endorsement. If the requirements document did not demand waiver of subrogation, per-project aggregate, or another feature, either omit the row or mark it as a baseline_check with empty requirement evidence.
- For "all required insurance" requirements, do not mark the row met if one of the required coverage lines is missing. Explain which line is supported and which line prevents full compliance.
- If the requirement is for carrier rating / AM Best / financial size category, use "needs_verification" with foundValue "Manual rating review required" even if the carrier name appears on the COI. Do not mark it missing just because the rating is absent from the certificate.
- Set priority by how material the gap is to the contract (missing required coverage or AI/WOS = critical/high; small documentation gaps = low).
- requiredValue and foundValue should be short and human-readable ("$1,000,000", "Required", "Not shown").
- requirementSource must be "requirements_document" for anything demanded by the actual requirements contract, "baseline_check" for default SubProtect checks, "non_coi_requirement" for non-insurance administrative items that should not be tested against a COI, and "non_contract_source" for requirements found only in initial bid/proposal/draft/non-contract materials.
- If requirementSource is "non_contract_source", status must be "needs_verification". If requirementSource is "requirements_document", status must not be "needs_verification" except for carrier rating / AM Best / financial strength requirements; use met, partial, missing, or not_applicable for ordinary COI requirements.
- requirementEvidenceExcerpts must be verbatim from the requirements document whenever requirementSource is "requirements_document" or "non_coi_requirement". Empty array only for baseline checks or if the requirement came only from structured extraction with no source excerpt available.
- coiEvidenceExcerpts must be verbatim from the COI text. Empty array if nothing supports it.
- Also populate requirementCitations and coiCitations with documentName, page, and excerpt whenever possible. The raw text contains explicit headings in the form "PDF PAGE N: filename" and "COI PACKAGE DOCUMENT N: filename — PDF PAGE M"; use those headings to set page to the actual 1-based PDF page number. For requirementCitations, use the exact requirements PDF filename as documentName. For coiCitations, use the exact package document heading or filename (e.g. "COI PACKAGE DOCUMENT 2: GL Endorsement.pdf") so the UI can open the correct attached PDF.
- Never mark something "met" without evidence in the COI.
- Never use COI evidence as requirement evidence. The requirement evidence answers "why are we checking this?" The COI evidence answers "what did the certificate show?"

REQUIRED (JSON):
${requiredCoverageJson}

ACTUAL — from the COI package (JSON):
${actualCoverageJson}

RAW REQUIREMENTS TEXT (for requirement evidence excerpts):
${requirementsMarkdown}

RAW COI PACKAGE TEXT (for evidence excerpts):
${coiMarkdown}`;
}

export function getOverseerPrompt(
  requiredCoverageJson: string,
  actualCoverageJson: string,
  findingsJson: string,
  requirementsFilename: string,
  requirementsMarkdown: string,
  coiMarkdown: string,
): string {
  return `You are the final overseer for SubProtect, a commercial insurance COI verification tool. A primary reviewer has already compared insurance requirements against a COI package and produced findings. Your job is to audit those findings and return only targeted corrections for material errors.

Do not perform a second full review. Do not return corrections for minor wording preferences. Return an empty corrections array if the findings are materially correct.

Audit priorities:
1. Identity matching: ensure named insured/vendor/subcontractor is compared to the correct subcontractor, not to the certificate holder/requestor. Certificate holder/requestor and named insured/vendor are different roles.
2. Exact endorsement/form compliance: for GL additional insured, completed operations, waiver of subrogation, primary/noncontributory, and aggregate-basis requirements, check whether the exact requested forms or equivalent scope are present. Do not over-credit a COI checkbox or "see attached" language when the attached form is narrower.
3. Conditional requirements: if the requirements text triggers a conditional line based on scope of work, such as crane services, pollution, professional services, or hazardous hauling, verify whether the scope actually triggers it before accepting not_applicable.
4. Administrative/non-COI requirements: separate contract administration tasks from ordinary COI defects. Examples include owner approval before work, wrap enrollment proof, lower-tier flow-down administration, licensing, and carrier rating lookup.
5. Evidence integrity: every met finding must have COI evidence; every requirements_document or non_coi_requirement finding must have requirement evidence.

Correction rules:
- Return a correction only when you can cite evidence from the requirements text and/or COI text below.
- For action "update", use an existing itemId. Include only the corrected final values for fields that should change; still include category/label/priority/status/source where you know them.
- For action "add", provide enough fields to create a complete finding. Add only if a material requirement is missing from the finding set.
- If a finding is over-credited as met but the COI partially supports it, use status "partial" and explain the missing form/scope/limit.
- If a finding is marked not_applicable but the contract scope triggers it and the COI does not satisfy it, use "missing" or "partial".
- If a requirement is a contract-admin task that the COI normally cannot prove, use requirementSource "non_coi_requirement" with status "not_applicable" unless the COI package specifically should contain that proof.
- If a correction only concerns AM Best/carrier rating, use status "needs_verification" and foundValue "Manual rating review required".
- Never mark a correction met unless the COI evidence in this prompt supports it.
- Keep reasoning broker-facing and concise.
- Use the exact requirements PDF filename for requirement citations: ${requirementsFilename}

REQUIRED EXTRACTION JSON:
${requiredCoverageJson}

ACTUAL COI EXTRACTION JSON:
${actualCoverageJson}

CURRENT FINDINGS JSON:
${findingsJson}

RAW REQUIREMENTS TEXT:
${requirementsMarkdown}

RAW COI PACKAGE TEXT:
${coiMarkdown}`;
}

/* ------------------------------------------------------------------ */
/*  Carrier rating online lookup (AM Best)                            */
/*                                                                    */
/*  Carrier financial-strength ratings are almost never printed on a  */
/*  COI. SubProtect looks them up online for every insurer, cites the */
/*  source, and compares to any required minimum — but the result is  */
/*  always advisory and must be confirmed manually by the account     */
/*  manager (never treated as a pass/fail).                           */
/* ------------------------------------------------------------------ */

export const carrierRatingLookupSchema = z.object({
  ratings: z.array(
    z.object({
      letter: z
        .string()
        .nullable()
        .describe("insurer letter (A–F) from the COI, when known"),
      carrierName: z.string().describe("the carrier as named on the COI"),
      ratingFound: z
        .string()
        .nullable()
        .describe(
          "the AM Best Financial Strength Rating letter grade alone, e.g. \"A\", \"A-\", \"A++\"; null if not found",
        ),
      ratingText: z
        .string()
        .nullable()
        .describe(
          "human-readable rating incl. descriptor and Financial Size Category, e.g. \"A (Excellent), FSC XV\"; null if not found",
        ),
      sourceUrl: z
        .string()
        .nullable()
        .describe("URL of the source used (prefer ratings.ambest.com); null if none"),
      sourceTitle: z
        .string()
        .nullable()
        .describe("short label for the source, e.g. \"AM Best — Travelers\""),
      requiredRating: z
        .string()
        .nullable()
        .describe("the minimum rating the contract requires, if any; else null"),
      matches: z
        .enum(["match", "below", "unknown", "no_requirement"])
        .describe(
          "match = found rating meets/exceeds required; below = falls short; unknown = could not determine; no_requirement = contract specified none",
        ),
      reasoning: z
        .string()
        .describe("one or two broker-facing sentences explaining the assessment"),
    }),
  ),
});

export type CarrierRatingLookup = z.infer<typeof carrierRatingLookupSchema>;

export function getCarrierRatingSearchPrompt(
  carriers: Array<{ letter: string | null; name: string; naic: string | null }>,
): string {
  const list = carriers
    .map(
      (c) =>
        `- ${c.letter ? `Insurer ${c.letter}: ` : ""}${c.name}${
          c.naic ? ` (NAIC ${c.naic})` : ""
        }`,
    )
    .join("\n");
  return `Use web search to find the CURRENT AM Best financial strength rating for each insurance carrier below. AM Best is the authoritative source (ratings.ambest.com); prefer it, and only fall back to other reputable sources if AM Best is unavailable.

For EACH carrier, report:
- the AM Best Financial Strength Rating (e.g. A++, A+, A, A-) and its descriptor,
- the Financial Size Category (FSC) when shown,
- the exact source URL you used (prefer the ratings.ambest.com company page).

Match on the exact legal entity name and NAIC number where possible — many carriers share similar names across a group, and different entities in a group can carry different ratings. If you cannot confidently identify the exact entity's rating, say so rather than guessing.

CARRIERS:
${list}`;
}

export function getCarrierRatingComparisonPrompt(
  searchText: string,
  sourcesJson: string,
  carriersJson: string,
  requiredRatingContext: string,
): string {
  return `Structure the web-search findings below into one row per carrier for SubProtect.

For each carrier in CARRIERS, produce a rating row:
- carrierName: the carrier as named on the COI.
- ratingFound / ratingText: the AM Best rating from the search result; null if the search did not confidently establish it.
- sourceUrl / sourceTitle: the best source URL and a short label. Prefer a ratings.ambest.com company page from the SOURCES list. Use null if no usable source.
- requiredRating: the minimum carrier rating the contract requires, taken from REQUIRED RATING CONTEXT; null if the contract specifies none.
- matches: "no_requirement" if the contract requires no rating; otherwise "match" if the found rating meets or exceeds the requirement, "below" if it falls short, "unknown" if the found rating is missing/uncertain. Compare using the AM Best scale where letter grade (A++ > A+ > A > A- > B++ ...) and Financial Size Category (Roman numerals, higher is larger) both matter.
- reasoning: one or two broker-facing sentences.

Never fabricate a rating or a source URL. If the search did not establish a carrier's rating, set ratingFound/ratingText to null, matches to "unknown", and explain briefly.

CARRIERS:
${carriersJson}

REQUIRED RATING CONTEXT:
${requiredRatingContext}

WEB SEARCH RESULT TEXT:
${searchText}

SOURCES (from the web search tool):
${sourcesJson}`;
}
