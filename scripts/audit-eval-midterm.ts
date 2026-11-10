/**
 * AuditGuard midterm-audit eval — variant of scripts/audit-eval.ts for cases
 * with NO ground-truth carrier audit. Instead of ground-truth audited
 * exposures, we OCR the paired P&L/Payroll document and ask the model to
 * pull the relevant exposure figures (gross sales/receipts or payroll),
 * then feed those into computeEstimates as the stage-2 financial inputs.
 *
 * Usage:
 *   MISTRAL_API_KEY=... OPENAI_API_KEY=... npx tsx scripts/audit-eval-midterm.ts extract [slug]
 *   npx tsx scripts/audit-eval-midterm.ts compute            (no API keys needed)
 *
 * Does NOT modify scripts/audit-eval.ts or its CASES.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { parsePdfWithOcr } from "../convex/lib/pdf";
import {
  policyExtractionSchema,
  type FinancialInputValue,
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
  "/private/tmp/claude-501/-Users-owencairns-Development-RedCedar-certmaster-crane/eba1ce38-b9f5-4a96-a6b6-5886f2c8ffc4/scratchpad/audit-eval";
const RESULTS = path.join(EVAL_DIR, "results");
const POLICIES = path.join(EVAL_DIR, "policies");

const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-mini";

interface EvalCase {
  slug: string;
  policyFile: string;
  financialFile: string; // P&L or Payroll doc
  financialKind: "pnl" | "payroll";
}

const CASES: EvalCase[] = [
  {
    slug: "mid-bk",
    policyFile: "B&K GL Policy.pdf",
    financialFile: "B&K P&L.pdf",
    financialKind: "pnl",
  },
  {
    slug: "mid-glperry",
    policyFile: "GL Perry GL Policy.pdf",
    financialFile: "GL Perry P&L.pdf",
    financialKind: "pnl",
  },
  {
    slug: "mid-jsgeneral",
    policyFile: "JS General GL Policy.pdf",
    financialFile: "JS General P&L.pdf",
    financialKind: "pnl",
  },
  {
    slug: "mid-komac",
    policyFile: "Komac GL Policy.pdf",
    financialFile: "Komac Payroll.pdf",
    financialKind: "payroll",
  },
  {
    slug: "mid-spacetone",
    policyFile: "Spacetone GL Policy.pdf",
    financialFile: "Spacetone Payroll.pdf",
    financialKind: "payroll",
  },
  {
    slug: "mid-swingstage",
    policyFile: "Swing Stage GL Policy.pdf",
    financialFile: "Swing Stage P&L.pdf",
    financialKind: "pnl",
  },
  {
    slug: "mid-vonpete",
    policyFile: "Vonpete GL Policy.pdf",
    financialFile: "Vonpete P&L.pdf",
    financialKind: "pnl",
  },
];

async function ocrToMarkdown(
  slug: string,
  label: string,
  file: string,
  cacheName: string
): Promise<string> {
  const ocrPath = path.join(RESULTS, cacheName);
  if (existsSync(ocrPath)) {
    console.log(`[${slug}] ${label} OCR cached`);
    return readFileSync(ocrPath, "utf8");
  }
  console.log(`[${slug}] OCR ${file}...`);
  const buffer = readFileSync(path.join(POLICIES, file));
  const result = await parsePdfWithOcr(buffer, process.env.MISTRAL_API_KEY!);
  const heading = `DOCUMENT: ${file}`;
  const markdown = [
    `# ${heading}`,
    ...result.pages.map((p) =>
      [`## ${heading} - PDF PAGE ${p.pageNumber}`, p.markdown].join("\n\n")
    ),
  ].join("\n\n");
  writeFileSync(ocrPath, markdown);
  console.log(`[${slug}] OCR done (${result.pages.length} pages, ${markdown.length} chars)`);
  return markdown;
}

/* ---- financial-figure extraction from P&L / Payroll doc ---- */

const financialExtractionSchema = z.object({
  documentType: z.enum(["pnl", "payroll", "other"]),
  figures: z.array(
    z.object({
      label: z.string().describe("e.g. 'Total Gross Sales/Receipts FY2025', 'Total Payroll - all employees'"),
      basis: z.enum(["revenue", "payroll", "subcontracted_cost", "units", "unknown"]),
      amount: z.number(),
      period: z.string().describe("fiscal period this figure covers, e.g. '2025' or 'trailing 12mo thru June 2026'"),
      monthsCovered: z
        .number()
        .nullable()
        .describe("number of months covered by period, or null when it cannot be determined"),
      classCode: z.string().nullable().describe("class code this figure maps to, if the document breaks it out by class"),
      state: z.string().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      notes: z.string().nullable(),
    })
  ),
  ambiguities: z.array(z.string()).describe("anything unclear about which figure(s) to use for rating exposure"),
});

function getFinancialExtractionPrompt(kind: "pnl" | "payroll", markdown: string): string {
  const focus =
    kind === "pnl"
      ? "gross sales / gross receipts / total revenue figures (the figure GL revenue-based rating would use)"
      : "total payroll / remuneration figures (the figure GL payroll-based rating would use), broken out by class code or employee category if the document does so";
  return `You are extracting exposure figures from a client's financial statement to use as the CURRENT financial input for a midterm General Liability audit true-up estimate.

Focus on: ${focus}.

Extract each distinct relevant figure found (e.g. per fiscal year, per class/department, or a single total). Prefer the MOST RECENT full-year or trailing-12-month figure if multiple periods are present, but list all reasonably relevant candidates so a human can pick.

Return amounts as plain numbers (no currency symbols/commas). For every figure, determine monthsCovered from the period text when possible (for example, August through February is 7 months and a full calendar/fiscal year is 12); return null when the period is unclear. If the document maps figures to a specific class code or state, capture that.

DOCUMENT:
${markdown}`;
}

/* ---- phase 1: extract (policy) + financial extraction ---- */

async function extractCase(c: EvalCase) {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = openai(ANALYSIS_MODEL);

  const policyMarkdown = await ocrToMarkdown(
    c.slug,
    "policy",
    c.policyFile,
    `ocr-${c.slug}-policy.md`
  );
  const financialMarkdown = await ocrToMarkdown(
    c.slug,
    "financial",
    c.financialFile,
    `ocr-${c.slug}-financial.md`
  );

  console.log(`[${c.slug}] extracting policy (${ANALYSIS_MODEL})...`);
  const extractionResult = await generateObject({
    model,
    schema: policyExtractionSchema,
    prompt: getPolicyExtractionPrompt(policyMarkdown),
  });

  console.log(`[${c.slug}] overseer...`);
  const overseerResult = await generateObject({
    model,
    schema: auditGuardOverseerResultSchema,
    prompt: getPolicyOverseerPrompt(
      JSON.stringify(extractionResult.object),
      policyMarkdown
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

  console.log(`[${c.slug}] extracting financial figures from ${c.financialFile}...`);
  const financialResult = await generateObject({
    model,
    schema: financialExtractionSchema,
    prompt: getFinancialExtractionPrompt(c.financialKind, financialMarkdown),
  });

  writeFileSync(
    path.join(RESULTS, `extraction-${c.slug}.json`),
    JSON.stringify(
      {
        extraction,
        overseerCorrections: overseerResult.object.corrections,
        inputRequests,
        financial: financialResult.object,
      },
      null,
      2
    )
  );
  console.log(
    `[${c.slug}] done: ${extraction.lines.length} lines, ${overseerResult.object.corrections.length} overseer corrections, ${inputRequests.length} input requests, ${financialResult.object.figures.length} financial figures`
  );
}

/* ---- phase 2: compute from extracted financial figures ---- */

function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  return normalized || null;
}

function computeCase(c: EvalCase) {
  const extractionPath = path.join(RESULTS, `extraction-${c.slug}.json`);
  if (!existsSync(extractionPath)) {
    console.log(`[${c.slug}] SKIP (missing extraction)`);
    return null;
  }
  const { extraction, inputRequests, financial } = JSON.parse(
    readFileSync(extractionPath, "utf8")
  );

  type Figure = {
    label: string;
    basis: string;
    amount: number;
    period: string;
    monthsCovered: number | null;
    classCode: string | null;
    state: string | null;
    confidence: string;
  };
  const figures: Figure[] = financial.figures;

  // Pick, per basis, the highest-confidence / most-recent-looking figure.
  // Prefer figures with a matching classCode/state to a given input request;
  // otherwise fall back to a basis-wide total (sum of non-overlapping figures
  // is NOT attempted here — ambiguity is flagged instead).
  const byBasisClassState = new Map<string, Figure[]>();
  const byBasisClass = new Map<string, Figure[]>();
  const byBasis = new Map<string, Figure[]>();
  for (const f of figures) {
    if (f.basis === "unknown") continue;
    const state = normalizeState(f.state);
    byBasis.set(f.basis, [...(byBasis.get(f.basis) ?? []), f]);
    if (f.classCode) {
      const k = `${f.basis}:${f.classCode}`;
      byBasisClass.set(k, [...(byBasisClass.get(k) ?? []), f]);
      if (state) {
        const k2 = `${f.basis}:${state}:${f.classCode}`;
        byBasisClassState.set(k2, [...(byBasisClassState.get(k2) ?? []), f]);
      }
    }
  }

  const rank = (fs: Figure[]) =>
    fs.sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 } as const;
      return (
        (confOrder[a.confidence as keyof typeof confOrder] ?? 3) -
        (confOrder[b.confidence as keyof typeof confOrder] ?? 3)
      );
    })[0];

  const inputs: Record<string, number | FinancialInputValue> = {};
  const inputSourceNotes: Record<string, string> = {};
  const ambiguousInputs: string[] = [];

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

    let candidates: Figure[] | undefined;
    if (stateClassKey && byBasisClassState.has(stateClassKey)) {
      candidates = byBasisClassState.get(stateClassKey);
    } else if (classKey && byBasisClass.has(classKey)) {
      candidates = byBasisClass.get(classKey);
    } else if (byBasis.has(req.basis)) {
      candidates = byBasis.get(req.basis);
    }

    if (!candidates || candidates.length === 0) continue;
    if (candidates.length > 1) {
      ambiguousInputs.push(
        `${req.key}: ${candidates.length} candidate figures for basis="${req.basis}" classCode=${req.classCode ?? "null"} — picked highest-confidence`
      );
    }
    const picked = rank([...candidates]);
    inputs[req.key] =
      picked.monthsCovered !== null &&
      Number.isFinite(picked.monthsCovered) &&
      picked.monthsCovered > 0 &&
      picked.monthsCovered < 11
        ? { amount: picked.amount, monthsCovered: picked.monthsCovered }
        : picked.amount;
    inputSourceNotes[req.key] = `${picked.label} (${picked.period}, confidence=${picked.confidence})`;
  }

  const { estimates, summary } = computeEstimates(extraction.lines, inputs, {
    minimumPremium: extraction.minimumPremium,
    expenseConstant: extraction.expenseConstant,
  });

  const comparison = {
    slug: c.slug,
    policyFile: c.policyFile,
    financialFile: c.financialFile,
    inputsFed: inputs,
    inputSourceNotes,
    ambiguousInputs,
    financialAmbiguities: financial.ambiguities,
    estimates,
    summary,
    // Midterm true-up: additional premium owed (or return) vs. currently
    // bound/deposit premium, based on projecting the audit-basis exposure.
    midtermTrueUp: summary.totalAdditionalPremium,
    projectedPremium: summary.totalProjectedPremium,
    currentBoundPremium: summary.totalCurrentPremium,
  };
  writeFileSync(
    path.join(RESULTS, `comparison-${c.slug}.json`),
    JSON.stringify(comparison, null, 2)
  );
  console.log(
    `[${c.slug}] trueUp=${comparison.midtermTrueUp} projected=${comparison.projectedPremium} currentBound=${comparison.currentBoundPremium}` +
      (ambiguousInputs.length ? ` (${ambiguousInputs.length} ambiguous inputs)` : "")
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
    for (const c of cases) {
      try {
        await extractCase(c);
      } catch (err) {
        console.error(`[${c.slug}] FAILED:`, err instanceof Error ? err.message : err);
      }
    }
  } else if (phase === "compute") {
    const rows = cases.map((c) => {
      try {
        return computeCase(c);
      } catch (err) {
        console.error(`[${c.slug}] COMPUTE FAILED:`, err instanceof Error ? err.message : err);
        return null;
      }
    }).filter(Boolean);
    console.log("\n=== SUMMARY ===");
    for (const r of rows) {
      console.log(
        `${r!.slug.padEnd(16)} trueUp=${String(r!.midtermTrueUp).padStart(12)} projected=${String(r!.projectedPremium).padStart(12)} currentBound=${String(r!.currentBoundPremium).padStart(12)}`
      );
    }
  } else {
    console.log("usage: audit-eval-midterm.ts extract|compute [slug]");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
