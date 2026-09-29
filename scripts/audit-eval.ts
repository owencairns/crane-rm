/**
 * AuditGuard accuracy eval — runs the REAL pipeline (same OCR, same
 * prompts, same schemas, same compute) against real policy PDFs, then
 * compares the computed true-up to actual completed carrier audits.
 *
 * Usage:
 *   MISTRAL_API_KEY=... OPENAI_API_KEY=... npx tsx scripts/audit-eval.ts extract [slug]
 *   npx tsx scripts/audit-eval.ts compute            (no API keys needed)
 *
 * Phase "extract": OCR each policy → stage-1 extraction → overseer →
 *   saves ocr-<slug>.md, extraction-<slug>.json, inputs-<slug>.json.
 * Phase "compute": feeds ground-truth audited exposures in as the
 *   stage-2 financial inputs → computeEstimates → comparison-<slug>.json.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { parsePdfWithOcr } from "../convex/lib/pdf";
import {
  policyExtractionSchema,
} from "../convex/lib/auditGuardSchemas";
import {
  getPolicyExtractionPrompt,
  getPolicyOverseerPrompt,
  auditGuardOverseerResultSchema,
} from "../convex/lib/auditGuardPrompts";
import {
  deriveInputRequests,
  computeEstimates,
  dedupeLines,
} from "../convex/lib/auditGuardCompute";
import { applyOverseerCorrections } from "../convex/lib/auditGuardCorrections";

const EVAL_DIR =
  "/private/tmp/claude-501/-Users-owencairns-Development-RedCedar-certmaster-crane/b1aafbdc-ce75-4251-9eaf-34dd93b04904/scratchpad/audit-eval";
const RESULTS = path.join(EVAL_DIR, "results");
const POLICIES = path.join(EVAL_DIR, "policies");

// Same default the Convex deployment uses (no OPENAI_ANALYSIS_MODEL set).
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-mini";

interface EvalCase {
  slug: string;
  policyFile: string;
  groundTruthFile: string;
}

const CASES: EvalCase[] = [
  {
    slug: "pcr",
    policyFile: "PCR Work Comp 2024-2025 Policy National Interstate.pdf",
    groundTruthFile: "ground-truth-pcr.json",
  },
  {
    slug: "bk",
    policyFile: "B&K Work Comp 2024-2025 Policy RT SpecialtyBerkleyNet.pdf",
    groundTruthFile: "ground-truth-bk.json",
  },
  {
    slug: "bwood",
    policyFile: "B Wood Work Comp 2024-2025 Policy ICW.pdf",
    groundTruthFile: "ground-truth-b-wood.json",
  },
  {
    slug: "935fremont",
    policyFile: "935 Fremont Work Comp 2024-2025 Policy Hartford.pdf",
    groundTruthFile: "ground-truth-935-fremont.json",
  },
  {
    slug: "spacetone",
    policyFile: "Spacetone - admitted - General Liability 2024-2025 Policy Hartford.pdf",
    groundTruthFile: "ground-truth-spacetone.json",
  },
  {
    slug: "glperry",
    policyFile:
      "GL Perry - non-admitted - General Liability 2024-2025 Policy RT SpecialtyCM Vantage.pdf",
    groundTruthFile: "ground-truth-gl-perry.json",
  },
  {
    slug: "bayarea",
    policyFile:
      "Bay Area HR - non-admitted - General Liability 2024-2025 Policy AscinsureGotham.pdf",
    groundTruthFile: "ground-truth-bay-area-high-reach.json",
  },
  {
    slug: "iinstall",
    policyFile: "IInstall - admitted - Package 2024-2025 Liberty Policy.pdf",
    groundTruthFile: "ground-truth-iinstall.json",
  },
];

/* ---- phase 1: extract ---- */

async function extractCase(c: EvalCase) {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = openai(ANALYSIS_MODEL);

  const ocrPath = path.join(RESULTS, `ocr-${c.slug}.md`);
  let markdown: string;
  if (existsSync(ocrPath)) {
    markdown = readFileSync(ocrPath, "utf8");
    console.log(`[${c.slug}] OCR cached (${markdown.length} chars)`);
  } else {
    console.log(`[${c.slug}] OCR ${c.policyFile}...`);
    const buffer = readFileSync(path.join(POLICIES, c.policyFile));
    const result = await parsePdfWithOcr(buffer, process.env.MISTRAL_API_KEY!);
    const label = `POLICY DOCUMENT 1: ${c.policyFile}`;
    markdown = [
      `# ${label}`,
      ...result.pages.map((p) =>
        [`## ${label} - PDF PAGE ${p.pageNumber}`, p.markdown].join("\n\n")
      ),
    ].join("\n\n");
    writeFileSync(ocrPath, markdown);
    console.log(`[${c.slug}] OCR done (${result.pages.length} pages, ${markdown.length} chars)`);
  }

  console.log(`[${c.slug}] extracting (${ANALYSIS_MODEL})...`);
  const extractionResult = await generateObject({
    model,
    schema: policyExtractionSchema,
    prompt: getPolicyExtractionPrompt(markdown),
  });

  console.log(`[${c.slug}] overseer...`);
  const overseerResult = await generateObject({
    model,
    schema: auditGuardOverseerResultSchema,
    prompt: getPolicyOverseerPrompt(
      JSON.stringify(extractionResult.object),
      markdown
    ),
  });

  const overseenExtraction = applyOverseerCorrections(
    extractionResult.object,
    overseerResult.object.corrections
  );
  const extraction = {
    ...overseenExtraction,
    lines: dedupeLines(overseenExtraction.lines),
  };
  const inputRequests = deriveInputRequests(extraction.lines);

  writeFileSync(
    path.join(RESULTS, `extraction-${c.slug}.json`),
    JSON.stringify(
      {
        extraction,
        overseerCorrections: overseerResult.object.corrections,
        inputRequests,
      },
      null,
      2
    )
  );
  console.log(
    `[${c.slug}] done: ${extraction.lines.length} lines, ${overseerResult.object.corrections.length} overseer corrections, ${inputRequests.length} input requests`
  );
}

/* ---- phase 2: compute from ground-truth actuals ---- */

interface GroundTruth {
  client: string;
  line: string;
  classLines: Array<{
    classCode: string | null;
    basis: string;
    auditedExposure: number | null;
    state?: string | null;
  }>;
  totals: {
    earnedPremium: number | null;
    depositPremium: number | null;
    additionalPremium: number | null;
    returnPremium: number | null;
  };
  notes: string[];
}

function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  return normalized || null;
}

function computeCase(c: EvalCase) {
  const extractionPath = path.join(RESULTS, `extraction-${c.slug}.json`);
  const gtPath = path.join(RESULTS, c.groundTruthFile);
  if (!existsSync(extractionPath) || !existsSync(gtPath)) {
    console.log(`[${c.slug}] SKIP (missing ${!existsSync(extractionPath) ? "extraction" : "ground truth"})`);
    return null;
  }
  const { extraction, inputRequests } = JSON.parse(
    readFileSync(extractionPath, "utf8")
  );
  const gt: GroundTruth = JSON.parse(readFileSync(gtPath, "utf8"));

  // Build stage-2 inputs from the audit's ACTUAL exposures — i.e. what a
  // perfect financial-extraction stage would have produced from the
  // client's books. Keyed the same way inputKeyForLine keys lines.
  const inputs: Record<string, number> = {};
  // Normalize the free-text basis strings in the ground truth to our enum.
  const normBasis = (b: string): string => {
    const s = b.toLowerCase();
    if (s.includes("subcontract") || s.includes("total cost") || s === "cost")
      return "subcontracted_cost";
    if (s.includes("revenue") || s.includes("sales") || s.includes("receipts"))
      return "revenue";
    if (s.includes("payroll") || s.includes("remuneration")) return "payroll";
    return s;
  };
  // Audit statements often list the SAME exposure twice at two rate
  // components (GL Prem/Ops + Prod/CompOps) — count each (class, exposure)
  // pair once. Same class across states/periods has different exposures,
  // so those still sum.
  const seen = new Set<string>();
  const sumByBasis: Record<string, number> = {};
  const sumByBasisAndState: Record<string, number> = {};
  const sumByBasisAndClass: Record<string, number> = {};
  const sumByBasisStateAndClass: Record<string, number> = {};
  const classedBases = new Set<string>();
  for (const cl of gt.classLines) {
    if (cl.auditedExposure === null) continue;
    const basis = normBasis(cl.basis);
    const state = normalizeState(cl.state);
    const dedupeKey = `${basis}|${state ?? ""}|${cl.classCode ?? ""}|${cl.auditedExposure}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    sumByBasis[basis] = (sumByBasis[basis] ?? 0) + cl.auditedExposure;
    if (state) {
      const stateKey = `${basis}:${state}`;
      sumByBasisAndState[stateKey] =
        (sumByBasisAndState[stateKey] ?? 0) + cl.auditedExposure;
    }
    if (cl.classCode) {
      classedBases.add(basis);
      const k = `${basis}:${cl.classCode}`;
      sumByBasisAndClass[k] = (sumByBasisAndClass[k] ?? 0) + cl.auditedExposure;
      if (state) {
        const stateClassKey = `${basis}:${state}:${cl.classCode}`;
        sumByBasisStateAndClass[stateClassKey] =
          (sumByBasisStateAndClass[stateClassKey] ?? 0) + cl.auditedExposure;
      }
    }
  }
  for (const req of inputRequests as Array<{
    key: string;
    basis: string;
    classCode: string | null;
    state?: string | null;
  }>) {
    const state = normalizeState(req.state);
    const stateClassKey =
      state && req.classCode ? `${req.basis}:${state}:${req.classCode}` : null;
    const classKey = req.classCode ? `${req.basis}:${req.classCode}` : null;
    const stateKey = state ? `${req.basis}:${state}` : null;
    if (
      stateClassKey &&
      sumByBasisStateAndClass[stateClassKey] !== undefined
    ) {
      inputs[req.key] = sumByBasisStateAndClass[stateClassKey];
    } else if (classKey && sumByBasisAndClass[classKey] !== undefined) {
      inputs[req.key] = sumByBasisAndClass[classKey];
    } else if (req.classCode && classedBases.has(req.basis)) {
      // Ground truth is class-coded for this basis but has no figure for
      // this class (e.g. an "if any" line) — feed nothing rather than the
      // whole book's exposure.
      continue;
    } else if (stateKey && sumByBasisAndState[stateKey] !== undefined) {
      inputs[req.key] = sumByBasisAndState[stateKey];
    } else if (sumByBasis[req.basis] !== undefined) {
      inputs[req.key] = sumByBasis[req.basis];
    }
  }

  const { estimates, summary } = computeEstimates(extraction.lines, inputs, {
    minimumPremium: extraction.minimumPremium,
    expenseConstant: extraction.expenseConstant,
  });

  const gtTrueUp =
    gt.totals.additionalPremium !== null && gt.totals.additionalPremium !== undefined
      ? gt.totals.additionalPremium
      : gt.totals.returnPremium !== null && gt.totals.returnPremium !== undefined
        ? -gt.totals.returnPremium
        : gt.totals.earnedPremium !== null && gt.totals.depositPremium !== null
          ? gt.totals.earnedPremium - gt.totals.depositPremium
          : null;

  // Second metric, immune to deposit-baseline ambiguity (mid-term
  // endorsements, payment plans): our projected FINAL premium vs the
  // audit's actual earned premium.
  const earnedError =
    gt.totals.earnedPremium !== null &&
    gt.totals.earnedPremium !== undefined &&
    summary.totalProjectedPremium !== null
      ? Math.round(
          (summary.totalProjectedPremium - gt.totals.earnedPremium) * 100
        ) / 100
      : null;

  const comparison = {
    client: gt.client,
    slug: c.slug,
    inputsFed: inputs,
    estimates,
    summary,
    groundTruth: gt.totals,
    actualTrueUp: gtTrueUp,
    ourTrueUp: summary.totalAdditionalPremium,
    errorDollars:
      gtTrueUp !== null && summary.totalAdditionalPremium !== null
        ? Math.round((summary.totalAdditionalPremium - gtTrueUp) * 100) / 100
        : null,
    ourProjectedPremium: summary.totalProjectedPremium,
    actualEarnedPremium: gt.totals.earnedPremium ?? null,
    earnedError,
  };
  writeFileSync(
    path.join(RESULTS, `comparison-${c.slug}.json`),
    JSON.stringify(comparison, null, 2)
  );
  console.log(
    `[${c.slug}] ours=${summary.totalAdditionalPremium} actual=${gtTrueUp} err=${comparison.errorDollars}`
  );
  return comparison;
}

/* ---- main ---- */

async function main() {
  const [phase, onlySlug] = process.argv.slice(2);
  const cases = onlySlug ? CASES.filter((c) => c.slug === onlySlug) : CASES;
  if (phase === "extract") {
    if (!process.env.MISTRAL_API_KEY || !process.env.OPENAI_API_KEY) {
      throw new Error("MISTRAL_API_KEY and OPENAI_API_KEY required for extract");
    }
    // Sequential to be gentle on rate limits; OCR results are cached.
    for (const c of cases) {
      try {
        await extractCase(c);
      } catch (err) {
        console.error(`[${c.slug}] FAILED:`, err instanceof Error ? err.message : err);
      }
    }
  } else if (phase === "compute") {
    const rows = cases.map(computeCase).filter(Boolean);
    console.log("\n=== SUMMARY ===");
    for (const r of rows) {
      console.log(
        `${r!.slug.padEnd(12)} ours=${String(r!.ourTrueUp).padStart(12)} actual=${String(r!.actualTrueUp).padStart(12)} err=${String(r!.errorDollars).padStart(12)} | projected=${String(r!.ourProjectedPremium).padStart(12)} earned=${String(r!.actualEarnedPremium).padStart(10)} earnedErr=${String(r!.earnedError).padStart(12)}`
      );
    }
  } else {
    console.log("usage: audit-eval.ts extract|compute [slug]");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
