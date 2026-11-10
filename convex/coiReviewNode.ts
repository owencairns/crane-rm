"use node";

import { generateObject, generateText, stepCountIs } from "ai";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { parsePdfWithOcr } from "./lib/pdf";
import { getNodeConfig } from "./lib/nodeConfig";
import {
  acord25RequirementsSchema,
  type Acord25Requirements,
  type Insurer,
} from "./lib/schemas/acord25";
import {
  getRequirementsExtractionPrompt,
  getCoiExtractionPrompt,
  getReviewPrompt,
  getOverseerPrompt,
  coiReviewResultSchema,
  coiOverseerResultSchema,
  type CoiOverseerResult,
  carrierRatingLookupSchema,
  getCarrierRatingSearchPrompt,
  getCarrierRatingComparisonPrompt,
} from "./lib/coiPrompts";
import type { LanguageModel } from "ai";

function getOpenAIProvider() {
  return createOpenAI({ apiKey: getNodeConfig().openai.apiKey });
}

function log(message: string, ctx?: Record<string, unknown>) {
  const suffix = ctx ? ` ${JSON.stringify(ctx)}` : "";
  console.log(`[coiReviewNode] ${message}${suffix}`);
}

const EXCLUDED_GOVERNMENT_BENEFIT_PATTERNS = [
  /\bunemployment\b/i,
  /\bunemployment compensation\b/i,
  /\bstate unemployment\b/i,
  /\bdisability insurance\b/i,
  /\bstate disability\b/i,
  /\btemporary disability\b/i,
  /\bpaid family leave\b/i,
  /\bpayroll tax/i,
];

const NON_CONTRACT_SOURCE_PATTERNS = [
  /\binitial bid\b/i,
  /\bbid document/i,
  /\bbid package/i,
  /\binvitation to bid\b/i,
  /\binstructions? to bidders?\b/i,
  /\bpre-?bid\b/i,
  /\bproposal\b/i,
  /\bquote\b/i,
  /\bestimate\b/i,
  /\bsolicitation\b/i,
  /\brfp\b/i,
  /\brfq\b/i,
  /\bdraft\b/i,
  /\bsample\b/i,
  /\bspecimen\b/i,
];

const CARRIER_RATING_PATTERNS = [
  /\bam\s*best\b/i,
  /\ba\.?m\.?\s*best\b/i,
  /\bbest'?s?\s+rating\b/i,
  /\bcarrier rating\b/i,
  /\bcarrier financial\b/i,
  /\bfinancial strength\b/i,
  /\bfinancial size\b/i,
  /\bsize category\b/i,
  /\brated\s+a[-+]?/i,
  /\ba[-+]?\s*(vii|vi|viii|ix|x|xi|xii|xiii|xiv|xv)\b/i,
  /\ba\s*-\s*vii\b/i,
];

type ReviewFinding = {
  itemId: string;
  category: string;
  label: string;
  priority: "critical" | "high" | "medium" | "low";
  requirementSource:
    | "requirements_document"
    | "baseline_check"
    | "non_coi_requirement"
    | "non_contract_source";
  status:
    | "met"
    | "partial"
    | "missing"
    | "needs_verification"
    | "not_applicable";
  requiredValue: string | null;
  foundValue: string | null;
  reasoning: string;
  recommendedAction: string | null;
  requirementEvidenceExcerpts: string[];
  requirementCitations?: EvidenceCitation[];
  coiEvidenceExcerpts: string[];
  coiCitations?: EvidenceCitation[];
  sourceLinks?: SourceLink[];
};

type SourceLink = {
  label: string;
  url: string;
};

type EvidenceCitation = {
  documentName?: string | null;
  page?: number | null;
  excerpt: string;
};

type OverseerCorrection = CoiOverseerResult["corrections"][number];

function hasNonContractSourceSignal(finding: ReviewFinding): boolean {
  const searchable = [
    finding.itemId,
    finding.category,
    finding.label,
    finding.requiredValue ?? "",
    finding.reasoning,
    ...finding.requirementEvidenceExcerpts,
  ].join("\n");

  return NON_CONTRACT_SOURCE_PATTERNS.some((pattern) =>
    pattern.test(searchable),
  );
}

function hasCarrierRatingSignal(finding: ReviewFinding): boolean {
  const searchable = [
    finding.itemId,
    finding.category,
    finding.label,
    finding.requiredValue ?? "",
    finding.foundValue ?? "",
    finding.reasoning,
    ...finding.requirementEvidenceExcerpts,
    ...finding.coiEvidenceExcerpts,
  ].join("\n");

  return CARRIER_RATING_PATTERNS.some((pattern) => pattern.test(searchable));
}

function isExcludedGovernmentBenefitFinding(finding: ReviewFinding): boolean {
  const searchable = [
    finding.itemId,
    finding.category,
    finding.label,
    finding.requiredValue ?? "",
    finding.reasoning,
    ...finding.requirementEvidenceExcerpts,
  ].join("\n");

  return EXCLUDED_GOVERNMENT_BENEFIT_PATTERNS.some((pattern) =>
    pattern.test(searchable),
  );
}

function normalizeFindingSourceAuthority(
  finding: ReviewFinding,
): ReviewFinding {
  if (hasCarrierRatingSignal(finding)) {
    return {
      ...finding,
      status: "needs_verification",
      foundValue: finding.foundValue ?? "Manual rating review required",
      reasoning:
        finding.status === "needs_verification"
          ? finding.reasoning
          : `${finding.reasoning} Carrier financial strength ratings are usually not shown on a COI, so this should be manually verified instead of treated as a certificate defect.`,
      recommendedAction:
        finding.recommendedAction ??
        "Manually verify the carrier's AM Best / financial strength rating outside the COI.",
    };
  }

  const fromNonContractSource =
    finding.requirementSource === "non_contract_source" ||
    hasNonContractSourceSignal(finding);

  if (fromNonContractSource) {
    return {
      ...finding,
      requirementSource: "non_contract_source",
      status: "needs_verification",
      foundValue: finding.foundValue ?? "Source authority needs review",
      reasoning:
        finding.status === "needs_verification"
          ? finding.reasoning
          : `${finding.reasoning} Confirm whether this requirement is binding because it appears to come from bid/proposal/draft/non-contract materials.`,
      recommendedAction:
        finding.recommendedAction ??
        "Confirm this requirement appears in the executed requirements contract before treating it as a COI defect.",
    };
  }

  if (finding.status === "needs_verification") {
    return {
      ...finding,
      status: "missing",
      foundValue: finding.foundValue ?? "Not shown",
      reasoning: `${finding.reasoning} Treated as missing because review flags are reserved for bid/proposal/draft/non-contract source issues.`,
      recommendedAction:
        finding.recommendedAction ??
        "Request corrected certificate package or attached endorsement evidence.",
    };
  }

  return finding;
}

function normalizeComparable(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|ltd|co|company|corporation|corp)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function meaningfulTokens(value: string | null | undefined): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "of",
    "for",
    "at",
    "project",
    "inc",
    "llc",
    "company",
    "construction",
    "home",
    "homes",
    "dr",
    "drive",
    "ave",
    "avenue",
    "street",
    "st",
    "ca",
  ]);
  return normalizeComparable(value)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function looksLikeSameEntity(
  expected: string | null | undefined,
  actual: string | null | undefined,
  minimumOverlap = 0.6,
): boolean {
  const normalizedExpected = normalizeComparable(expected);
  const normalizedActual = normalizeComparable(actual);
  if (!normalizedExpected || !normalizedActual) return true;
  if (
    normalizedExpected.includes(normalizedActual) ||
    normalizedActual.includes(normalizedExpected)
  ) {
    return true;
  }

  const expectedTokens = meaningfulTokens(expected);
  const actualTokens = new Set(meaningfulTokens(actual));
  if (expectedTokens.length === 0 || actualTokens.size === 0) return true;
  const overlap = expectedTokens.filter((token) =>
    actualTokens.has(token),
  ).length;
  return overlap / expectedTokens.length >= minimumOverlap;
}

function getProjectLabel(extraction: Acord25Requirements): string | null {
  return (
    extraction.contractInfo.projectName ??
    extraction.descriptionOfOperations.structured.projectName ??
    extraction.descriptionOfOperations.text ??
    null
  );
}

function getExpectedCertificateHolder(
  required: Acord25Requirements,
): string | null {
  return (
    required.certificateHolder?.name ??
    required.contractInfo.parties.contractor ??
    required.contractInfo.parties.requestor ??
    null
  );
}

function extractVendorFromRequirementsText(markdown: string): string | null {
  const patterns = [
    /\b([A-Z][A-Za-z0-9&.,' -]{2,80}?)\s+is\s+to\s+provide\b/g,
    /\b([A-Z][A-Za-z0-9&.,' -]{2,80}?)\s+shall\s+(?:provide|procure|maintain)\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const candidate = match[1]
        ?.replace(/^.*[,.;]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (candidate && meaningfulTokens(candidate).length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

function getExpectedNamedInsured(
  required: Acord25Requirements,
  requirementsMarkdown?: string,
): string | null {
  if (required.namedInsured?.name) return required.namedInsured.name;

  const certificateHolder = getExpectedCertificateHolder(required);
  const extractedVendor = requirementsMarkdown
    ? extractVendorFromRequirementsText(requirementsMarkdown)
    : null;
  if (
    extractedVendor &&
    (!certificateHolder ||
      !looksLikeSameEntity(certificateHolder, extractedVendor))
  ) {
    return extractedVendor;
  }

  const contractor = required.contractInfo.parties.contractor;
  if (
    contractor &&
    (!certificateHolder || !looksLikeSameEntity(certificateHolder, contractor))
  ) {
    return contractor;
  }

  return null;
}

function citation(
  documentName: string | null,
  page: number | null,
  excerpt: string | null | undefined,
): EvidenceCitation[] {
  if (!excerpt) return [];
  return [
    {
      ...(documentName ? { documentName } : {}),
      ...(page ? { page } : {}),
      excerpt,
    },
  ];
}

function replaceFinding(
  findings: ReviewFinding[],
  finding: ReviewFinding,
): ReviewFinding[] {
  return [
    finding,
    ...findings.filter((candidate) => candidate.itemId !== finding.itemId),
  ];
}

function createIdentityFinding(args: {
  itemId: string;
  label: string;
  priority: ReviewFinding["priority"];
  status: ReviewFinding["status"];
  requiredValue: string | null;
  foundValue: string | null;
  reasoning: string;
  recommendedAction?: string;
  requirementCitation?: EvidenceCitation[];
  coiCitation?: EvidenceCitation[];
}): ReviewFinding {
  return {
    itemId: args.itemId,
    category: "Special",
    label: args.label,
    priority: args.priority,
    requirementSource: "baseline_check",
    status: args.status,
    requiredValue: args.requiredValue,
    foundValue: args.foundValue,
    reasoning: args.reasoning,
    recommendedAction: args.recommendedAction ?? null,
    requirementEvidenceExcerpts:
      args.requirementCitation?.map((entry) => entry.excerpt) ?? [],
    requirementCitations: args.requirementCitation ?? [],
    coiEvidenceExcerpts: args.coiCitation?.map((entry) => entry.excerpt) ?? [],
    coiCitations: args.coiCitation ?? [],
  };
}

function hasUsableCorrectionEvidence(correction: OverseerCorrection): boolean {
  return (
    correction.confidence !== "low" &&
    correction.reasoning.trim().length > 0 &&
    ((correction.requirementCitations?.length ?? 0) > 0 ||
      (correction.coiCitations?.length ?? 0) > 0)
  );
}

function citationsToExcerpts(citations: EvidenceCitation[] | null): string[] {
  return citations?.map((entry) => entry.excerpt).filter(Boolean) ?? [];
}

function applyNullable<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function applyOverseerCorrections(
  findings: ReviewFinding[],
  corrections: OverseerCorrection[],
): ReviewFinding[] {
  if (corrections.length === 0) return findings;

  const byItemId = new Map(
    findings.map((finding) => [finding.itemId, finding]),
  );

  for (const correction of corrections) {
    if (!hasUsableCorrectionEvidence(correction)) continue;

    const existing = byItemId.get(correction.itemId);

    if (!existing && correction.action !== "add") continue;

    if (existing) {
      const requirementCitations =
        correction.requirementCitations.length > 0
          ? correction.requirementCitations
          : (existing.requirementCitations ?? []);
      const coiCitations =
        correction.coiCitations.length > 0
          ? correction.coiCitations
          : (existing.coiCitations ?? []);

      byItemId.set(correction.itemId, {
        ...existing,
        category: applyNullable(correction.category, existing.category),
        label: applyNullable(correction.label, existing.label),
        priority: applyNullable(correction.priority, existing.priority),
        requirementSource: applyNullable(
          correction.requirementSource,
          existing.requirementSource,
        ),
        status: applyNullable(correction.status, existing.status),
        requiredValue:
          correction.requiredValue !== null
            ? correction.requiredValue
            : existing.requiredValue,
        foundValue:
          correction.foundValue !== null
            ? correction.foundValue
            : existing.foundValue,
        reasoning: `Overseer correction: ${correction.reasoning}`,
        recommendedAction:
          correction.recommendedAction !== null
            ? correction.recommendedAction
            : existing.recommendedAction,
        requirementCitations,
        requirementEvidenceExcerpts:
          correction.requirementCitations.length > 0
            ? citationsToExcerpts(correction.requirementCitations)
            : existing.requirementEvidenceExcerpts,
        coiCitations,
        coiEvidenceExcerpts:
          correction.coiCitations.length > 0
            ? citationsToExcerpts(correction.coiCitations)
            : existing.coiEvidenceExcerpts,
      });
      continue;
    }

    if (
      correction.category &&
      correction.label &&
      correction.priority &&
      correction.requirementSource &&
      correction.status
    ) {
      byItemId.set(correction.itemId, {
        itemId: correction.itemId,
        category: correction.category,
        label: correction.label,
        priority: correction.priority,
        requirementSource: correction.requirementSource,
        status: correction.status,
        requiredValue: correction.requiredValue,
        foundValue: correction.foundValue,
        reasoning: `Overseer correction: ${correction.reasoning}`,
        recommendedAction: correction.recommendedAction,
        requirementEvidenceExcerpts: citationsToExcerpts(
          correction.requirementCitations,
        ),
        requirementCitations: correction.requirementCitations,
        coiEvidenceExcerpts: citationsToExcerpts(correction.coiCitations),
        coiCitations: correction.coiCitations,
      });
    }
  }

  return Array.from(byItemId.values());
}

function withDeterministicIdentityFindings(
  findings: ReviewFinding[],
  required: Acord25Requirements,
  actual: Acord25Requirements,
  requirementsFilename: string,
  requirementsMarkdown: string,
): ReviewFinding[] {
  let next = findings;

  const expectedHolder = getExpectedCertificateHolder(required);
  const actualHolder = actual.certificateHolder?.name ?? null;
  if (expectedHolder && actualHolder) {
    const matches = looksLikeSameEntity(expectedHolder, actualHolder);
    next = replaceFinding(
      next,
      createIdentityFinding({
        itemId: "special.certificateHolderMatch",
        label: "Certificate Holder Matches Requirements",
        priority: matches ? "medium" : "critical",
        status: matches ? "met" : "missing",
        requiredValue: expectedHolder,
        foundValue: actualHolder,
        reasoning: matches
          ? "The certificate holder appears to match the party identified by the requirements document."
          : "The certificate holder on the COI does not match the certificate holder/requestor identified by the requirements document.",
        recommendedAction: matches
          ? undefined
          : "Provide a corrected COI naming the required certificate holder for this requirements document.",
        requirementCitation: citation(
          requirementsFilename,
          null,
          `Required certificate holder/requestor: ${expectedHolder}`,
        ),
        coiCitation: citation(
          null,
          null,
          `COI certificate holder: ${actualHolder}`,
        ),
      }),
    );
  }

  const expectedInsured = getExpectedNamedInsured(
    required,
    requirementsMarkdown,
  );
  const actualInsured = actual.namedInsured?.name ?? null;
  if (expectedInsured && actualInsured) {
    const matches = looksLikeSameEntity(expectedInsured, actualInsured);
    next = replaceFinding(
      next,
      createIdentityFinding({
        itemId: "special.namedInsuredMatch",
        label: "Named Insured / Vendor Match",
        priority: "critical",
        status: matches ? "met" : "missing",
        requiredValue: expectedInsured,
        foundValue: actualInsured,
        reasoning: matches
          ? "The named insured appears to match the vendor/subcontractor identified by the requirements document."
          : "The named insured on the COI does not match the vendor/subcontractor identified by the requirements document.",
        recommendedAction: matches
          ? undefined
          : "Provide a COI for the vendor/subcontractor named in the requirements document.",
        requirementCitation: citation(
          requirementsFilename,
          null,
          `Required named insured/vendor: ${expectedInsured}`,
        ),
        coiCitation: citation(
          null,
          null,
          `COI named insured: ${actualInsured}`,
        ),
      }),
    );
  }

  const expectedProject = getProjectLabel(required);
  const actualProject = getProjectLabel(actual);
  if (expectedProject && actualProject) {
    const matches = looksLikeSameEntity(expectedProject, actualProject, 0.35);
    next = replaceFinding(
      next,
      createIdentityFinding({
        itemId: "special.projectMatch",
        label: "Project / Location Match",
        priority: matches ? "medium" : "critical",
        status: matches ? "met" : "missing",
        requiredValue: expectedProject,
        foundValue: actualProject,
        reasoning: matches
          ? "The project/location shown by the COI appears to match the requirements document."
          : "The project/location shown by the COI does not match the project/location in the requirements document.",
        recommendedAction: matches
          ? undefined
          : "Provide a COI package issued for the same project/location as the requirements document.",
        requirementCitation: citation(
          requirementsFilename,
          null,
          `Requirements project/location: ${expectedProject}`,
        ),
        coiCitation: citation(
          null,
          null,
          `COI project/location: ${actualProject}`,
        ),
      }),
    );
  }

  return next;
}

function hasSpecialRequirement(
  required: Acord25Requirements,
  pattern: RegExp,
): boolean {
  return required.specialRequirements.some((requirement) =>
    pattern.test(`${requirement.requirement}\n${requirement.excerpt}`),
  );
}

function structuredRequirementSupportsFinding(
  required: Acord25Requirements,
  finding: ReviewFinding,
): boolean | null {
  switch (finding.itemId) {
    case "generalLiability.waiverOfSubrogation":
      return (
        required.coverages.generalLiability.subrogationWaived ||
        hasSpecialRequirement(
          required,
          /waiver of subrogation|subrogation waived/i,
        )
      );
    case "autoLiability.waiverOfSubrogation":
      return (
        required.coverages.autoLiability.subrogationWaived ||
        hasSpecialRequirement(
          required,
          /auto(?:mobile)?[\s\S]{0,80}waiver of subrogation|waiver of subrogation[\s\S]{0,80}auto/i,
        )
      );
    case "workersComp.subrogationWaived":
      return (
        required.coverages.workersComp.subrogationWaived ||
        hasSpecialRequirement(
          required,
          /workers'? comp[\s\S]{0,80}waiver of subrogation|waiver of subrogation[\s\S]{0,80}workers'? comp/i,
        )
      );
    case "generalLiability.genAggregatePerProject":
      return (
        required.coverages.generalLiability.genAggregateAppliesPer ===
          "project" ||
        hasSpecialRequirement(
          required,
          /aggregate[\s\S]{0,40}per project|per project[\s\S]{0,40}aggregate/i,
        )
      );
    default:
      return null;
  }
}

function normalizeUnsupportedRequirementRows(
  findings: ReviewFinding[],
  required: Acord25Requirements,
): ReviewFinding[] {
  return findings.flatMap((finding) => {
    if (finding.requirementSource !== "requirements_document") return [finding];

    const supported = structuredRequirementSupportsFinding(required, finding);
    if (supported !== false) return [finding];

    if (finding.itemId === "generalLiability.genAggregatePerProject") {
      return [];
    }

    return [
      {
        ...finding,
        requirementSource: "baseline_check",
        requiredValue: "Baseline check",
        requirementEvidenceExcerpts: [],
        requirementCitations: [],
        reasoning: `${finding.reasoning} The requirements extraction did not identify this as a contract requirement, so this row is treated as a SubProtect baseline check rather than a requirements-document defect.`,
      },
    ];
  });
}

function withPrimaryAllInsuranceGuard(
  findings: ReviewFinding[],
  required: Acord25Requirements,
  actual: Acord25Requirements,
): ReviewFinding[] {
  const autoRequired = required.coverages.autoLiability.required;
  const autoEvidenced =
    actual.coverages.autoLiability.required &&
    actual.coverages.autoLiability.limits.combinedSingleLimit !== null;

  if (!autoRequired || autoEvidenced) return findings;

  return findings.map((finding) => {
    if (finding.itemId !== "special.primaryNoncontribAllInsurance") {
      return finding;
    }

    return {
      ...finding,
      status: "partial",
      foundValue: "Supported for GL only; auto not evidenced",
      reasoning:
        "The contract applies primary/noncontributory language to required insurance, but the COI only supports that wording for General Liability while required auto liability is not evidenced.",
      recommendedAction:
        "Provide auto liability evidence and any required primary/noncontributory wording for required non-GL policies, or confirm the requirement is intended to apply only to GL.",
    };
  });
}

function normalizeActualCoverageCheckboxes(
  actual: Acord25Requirements,
  coiMarkdown: string,
): Acord25Requirements {
  const glEvidenceText = [
    coiMarkdown,
    actual.coverages.generalLiability.notes ?? "",
    ...actual.coverages.generalLiability.evidence.map((entry) => entry.excerpt),
  ].join("\n");

  if (/claims[-\s]?made\s+x\s+occur/i.test(glEvidenceText)) {
    actual.coverages.generalLiability.formType = "occurrence";
    actual.coverages.generalLiability.notes = [
      actual.coverages.generalLiability.notes,
      "SubProtect normalized the ACORD checkbox text as occurrence-selected because the extracted line places X immediately before OCCUR.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return actual;
}

function withFormTypeGuard(
  findings: ReviewFinding[],
  required: Acord25Requirements,
  actual: Acord25Requirements,
): ReviewFinding[] {
  if (
    required.coverages.generalLiability.formType !== "occurrence" ||
    actual.coverages.generalLiability.formType !== "occurrence"
  ) {
    return findings;
  }

  return findings.map((finding) => {
    if (finding.itemId !== "generalLiability.formType") return finding;
    return {
      ...finding,
      status: "met",
      foundValue: "Occurrence selected",
      reasoning:
        "The contract requires occurrence form or equivalent, and the ACORD GL line shows the occurrence box selected.",
      recommendedAction: null,
    };
  });
}

async function ocrStorageFile(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  mistralApiKey: string,
  filename: string,
): Promise<string> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) throw new Error("Uploaded file not found in storage");
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = await parsePdfWithOcr(buffer, mistralApiKey);
  return [
    `# SOURCE PDF: ${filename}`,
    ...result.pages.map((page) =>
      [`## PDF PAGE ${page.pageNumber}: ${filename}`, page.markdown].join(
        "\n\n",
      ),
    ),
  ].join("\n\n");
}

async function ocrStoragePackage(
  ctx: ActionCtx,
  files: Array<{ filename: string; storageId: Id<"_storage"> }>,
  mistralApiKey: string,
): Promise<string> {
  const parts = await Promise.all(
    files.map(async (file, index) => {
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) throw new Error("Uploaded file not found in storage");
      const buffer = Buffer.from(await blob.arrayBuffer());
      const result = await parsePdfWithOcr(buffer, mistralApiKey);
      const documentLabel = `COI PACKAGE DOCUMENT ${index + 1}: ${file.filename}`;

      return [
        `# ${documentLabel}`,
        ...result.pages.map((page) =>
          [
            `## ${documentLabel} - PDF PAGE ${page.pageNumber}`,
            page.markdown,
          ].join("\n\n"),
        ),
      ].join("\n\n");
    }),
  );
  return parts.join("\n\n---\n\n");
}

function buildRequiredRatingContext(
  required: Acord25Requirements,
): string {
  const ratingRequirements = required.specialRequirements.filter((req) =>
    CARRIER_RATING_PATTERNS.some((pattern) =>
      pattern.test(`${req.requirement}\n${req.excerpt}`),
    ),
  );

  if (ratingRequirements.length === 0) {
    return "The contract does not specify any minimum carrier financial-strength / AM Best rating.";
  }

  return [
    "The contract specifies the following carrier rating requirement(s):",
    ...ratingRequirements.map(
      (req) => `- ${req.requirement} (excerpt: "${req.excerpt}")`,
    ),
  ].join("\n");
}

async function lookupCarrierRatings(
  provider: OpenAIProvider,
  modelId: string,
  insurers: Insurer[],
  requiredRatingContext: string,
): Promise<ReviewFinding[]> {
  const carriers = insurers.filter((insurer) => insurer.name.trim().length > 0);
  if (carriers.length === 0) return [];

  const model = provider(modelId) as LanguageModel;

  // Step 1 — web search (tool, no schema). One call covers every carrier.
  const search = await generateText({
    model,
    tools: { web_search: provider.tools.webSearch({}) },
    stopWhen: stepCountIs(4),
    prompt: getCarrierRatingSearchPrompt(carriers),
  });

  const sources = search.sources
    .filter((source) => source.sourceType === "url")
    .map((source) => ({ title: source.title ?? null, url: source.url }));

  // Step 2 — structure the result (schema, no tools).
  const structured = await generateObject({
    model,
    schema: carrierRatingLookupSchema,
    prompt: getCarrierRatingComparisonPrompt(
      search.text,
      JSON.stringify(sources),
      JSON.stringify(carriers),
      requiredRatingContext,
    ),
  });

  return structured.object.ratings.map((rating, index) =>
    buildCarrierRatingFinding(rating, index),
  );
}

function buildCarrierRatingFinding(
  rating: {
    letter: string | null;
    carrierName: string;
    ratingFound: string | null;
    ratingText: string | null;
    sourceUrl: string | null;
    sourceTitle: string | null;
    requiredRating: string | null;
    matches: "match" | "below" | "unknown" | "no_requirement";
    reasoning: string;
  },
  index: number,
): ReviewFinding {
  const itemId = `carrierRating.${rating.letter ?? index}`;
  const sourceLinks: SourceLink[] = rating.sourceUrl
    ? [{ label: rating.sourceTitle ?? "AM Best", url: rating.sourceUrl }]
    : [];

  return {
    itemId,
    category: "Carrier Ratings",
    label: `${rating.carrierName} — AM Best rating`,
    priority: rating.matches === "below" ? "high" : "medium",
    requirementSource: "baseline_check",
    // Always manual: the looked-up rating is a cited hint, never a pass/fail.
    status: "needs_verification",
    requiredValue: rating.requiredRating ?? "No rating specified in contract",
    foundValue: rating.ratingText ?? rating.ratingFound ?? "Not found online",
    reasoning: `${rating.reasoning} Carrier ratings are not shown on the COI and can change; confirm before relying on this.`,
    recommendedAction:
      "Verify this rating directly at ratings.ambest.com before relying on it.",
    requirementEvidenceExcerpts: [],
    requirementCitations: [],
    coiEvidenceExcerpts: [],
    coiCitations: [],
    sourceLinks,
  };
}

export const ingestReview = internalAction({
  args: {
    reviewId: v.id("coiReviews"),
    ownerId: v.string(),
  },
  handler: async (ctx, { reviewId, ownerId }) => {
    const review = await ctx.runQuery(internal.coiReviews.getReviewRecord, {
      reviewId,
    });

    if (
      !review ||
      review.ownerId !== ownerId ||
      !review.requirementsStorageId ||
      (!review.coiStorageId && !review.coiStorageIds?.length)
    ) {
      throw new Error("Review not found or inaccessible");
    }

    const config = getNodeConfig();
    const provider = getOpenAIProvider();
    const model = provider(config.openai.analysisModel);
    const overseerModel = provider(config.openai.coiOverseerModel);

    try {
      /* ---- 1. OCR both documents ---- */
      await ctx.runMutation(internal.coiReviews.patchReview, {
        reviewId,
        patch: { status: "parsing", updatedAt: Date.now() },
      });

      log("OCR both docs", { reviewId });
      const coiStorageIds =
        review.coiStorageIds ??
        (review.coiStorageId ? [review.coiStorageId] : []);
      const coiFilenames =
        review.coiFilenames &&
        review.coiFilenames.length === coiStorageIds.length
          ? review.coiFilenames
          : coiStorageIds.map((_, index) =>
              index === 0 ? review.coiFilename : `COI attachment ${index + 1}`,
            );
      const coiFiles = coiStorageIds.map((storageId, index) => ({
        storageId,
        filename: coiFilenames[index],
      }));

      const [requirementsMarkdown, coiMarkdown] = await Promise.all([
        ocrStorageFile(
          ctx,
          review.requirementsStorageId,
          config.mistral.apiKey,
          review.requirementsFilename,
        ),
        ocrStoragePackage(ctx, coiFiles, config.mistral.apiKey),
      ]);

      /* ---- 2. Extract both into the canonical ACORD-25 shape ---- */
      await ctx.runMutation(internal.coiReviews.patchReview, {
        reviewId,
        patch: { status: "extracting", updatedAt: Date.now() },
      });

      log("Extracting required + actual coverage", { reviewId });
      const [requiredResult, actualResult] = await Promise.all([
        generateObject({
          model,
          schema: acord25RequirementsSchema,
          prompt: getRequirementsExtractionPrompt(requirementsMarkdown),
        }),
        generateObject({
          model,
          schema: acord25RequirementsSchema,
          prompt: getCoiExtractionPrompt(coiMarkdown),
        }),
      ]);

      const requiredObject = requiredResult.object;
      const actualObject = normalizeActualCoverageCheckboxes(
        actualResult.object,
        coiMarkdown,
      );

      const requiredCoverage = JSON.stringify(requiredObject);
      const actualCoverage = JSON.stringify(actualObject);
      const insuredName =
        actualObject.namedInsured?.name ??
        actualObject.certificateHolder?.name ??
        undefined;

      await ctx.runMutation(internal.coiReviews.patchReview, {
        reviewId,
        patch: {
          requiredCoverage,
          actualCoverage,
          insuredName,
          status: "reviewing",
          updatedAt: Date.now(),
        },
      });

      /* ---- 2b. Look up carrier ratings online (runs concurrently) ---- */
      const carrierRatingsPromise = lookupCarrierRatings(
        provider,
        config.openai.analysisModel,
        actualObject.insurers ?? [],
        buildRequiredRatingContext(requiredObject),
      ).catch((error) => {
        log("Carrier rating lookup failed", {
          reviewId,
          error: error instanceof Error ? error.message : "unknown",
        });
        return [] as ReviewFinding[];
      });

      /* ---- 3. Cross-examine: required vs actual → findings ---- */
      log("Reviewing required vs actual", { reviewId });
      const reviewResult = await generateObject({
        model,
        schema: coiReviewResultSchema,
        prompt: getReviewPrompt(
          requiredCoverage,
          actualCoverage,
          review.requirementsFilename,
          requirementsMarkdown,
          coiMarkdown,
        ),
      });

      const preOverseerFindings = withFormTypeGuard(
        withPrimaryAllInsuranceGuard(
          normalizeUnsupportedRequirementRows(
            withDeterministicIdentityFindings(
              reviewResult.object.findings
                .filter(
                  (finding) => !isExcludedGovernmentBenefitFinding(finding),
                )
                .map(normalizeFindingSourceAuthority),
              requiredObject,
              actualObject,
              review.requirementsFilename,
              requirementsMarkdown,
            ),
            requiredObject,
          ),
          requiredObject,
          actualObject,
        ),
        requiredObject,
        actualObject,
      );

      log("Overseer audit", {
        reviewId,
        model: config.openai.coiOverseerModel,
        findingCount: preOverseerFindings.length,
      });
      const overseerResult = await generateObject({
        model: overseerModel,
        schema: coiOverseerResultSchema,
        prompt: getOverseerPrompt(
          requiredCoverage,
          actualCoverage,
          JSON.stringify(preOverseerFindings),
          review.requirementsFilename,
          requirementsMarkdown,
          coiMarkdown,
        ),
      });

      const correctedFindings = applyOverseerCorrections(
        preOverseerFindings,
        overseerResult.object.corrections,
      );

      log("Overseer corrections applied", {
        reviewId,
        corrections: overseerResult.object.corrections.length,
        finalFindingCount: correctedFindings.length,
      });

      // Carrier-rating findings are authoritative online lookups; append them
      // after the overseer so they are never mutated by corrections.
      const carrierRatingFindings = await carrierRatingsPromise;
      const findings = [...correctedFindings, ...carrierRatingFindings];

      log("Carrier ratings appended", {
        reviewId,
        carrierRatingCount: carrierRatingFindings.length,
      });

      await ctx.runMutation(internal.coiReviews.replaceFindings, {
        reviewId,
        ownerId,
        findings: findings.map((f) => ({
          ...f,
          requiredValue: f.requiredValue ?? undefined,
          foundValue: f.foundValue ?? undefined,
          recommendedAction: f.recommendedAction ?? undefined,
        })),
      });

      const summaryCounts = {
        met: findings.filter((f) => f.status === "met").length,
        partial: findings.filter((f) => f.status === "partial").length,
        missing: findings.filter((f) => f.status === "missing").length,
        needsVerification: findings.filter(
          (f) => f.status === "needs_verification",
        ).length,
        notApplicable: findings.filter((f) => f.status === "not_applicable")
          .length,
      };

      await ctx.runMutation(internal.coiReviews.patchReview, {
        reviewId,
        patch: {
          status: "complete",
          summaryCounts,
          updatedAt: Date.now(),
        },
      });

      log("Review complete", { reviewId, ...summaryCounts });
    } catch (error) {
      log("Review failed", {
        reviewId,
        error: error instanceof Error ? error.message : "unknown",
      });
      await ctx.runMutation(internal.coiReviews.patchReview, {
        reviewId,
        patch: {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          updatedAt: Date.now(),
        },
      });
      throw error;
    }
  },
});
