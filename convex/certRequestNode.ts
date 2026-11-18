"use node";

import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { parsePdfWithOcr } from "./lib/pdf";
import { getNodeConfig } from "./lib/nodeConfig";
import type { OcrPage } from "./lib/types";
import {
  certRequirementsSchema,
  coverageExtractionSchema,
  partiesExtractionSchema,
  type CertEdits,
  type CertRequirements,
  type VerifiedEvidence,
} from "./lib/certmaster/schema";
import { getCoverageExtractionPrompt, getPartiesExtractionPrompt } from "./lib/certmaster/prompts";
import {
  applyEdits,
  assembleRequirements,
  buildChecks,
  detectDocumentSignals,
  verifyEvidence,
} from "./lib/certmaster/assemble";
import { buildCertRemarks } from "./lib/certmaster/remarks";
import { fillAcord25 } from "./lib/certmaster/filler";

function log(message: string, ctx?: Record<string, unknown>) {
  console.log(`[certmaster] ${message}${ctx ? ` ${JSON.stringify(ctx)}` : ""}`);
}

/*
 * Long contracts: the insurance article is usually a few pages. Above this
 * size we send the parties pages (first/last) plus every page that talks
 * about insurance, instead of all of it. Keeps cost and latency flat.
 */
const FULL_TEXT_CHAR_LIMIT = 160_000;
const ATTACH_PDF_MAX_PAGES = 12;
const ATTACH_PDF_MAX_BYTES = 15 * 1024 * 1024;
const INSURANCE_PAGE =
  /insur|certificate|additional insured|subrogation|primary and non|non-?contributory|umbrella|excess liab|workers'? comp|employer'?s'? liab|general liability|automobile|aggregate|endorse|\bCG ?20|indemn/i;

function selectPages(pages: OcrPage[]): { pages: OcrPage[]; trimmed: boolean } {
  const total = pages.reduce((n, p) => n + p.markdown.length, 0);
  if (total <= FULL_TEXT_CHAR_LIMIT) return { pages, trimmed: false };
  const keep = new Set<number>();
  const n = pages.length;
  [0, 1, 2, n - 2, n - 1].forEach((i) => i >= 0 && i < n && keep.add(i));
  pages.forEach((p, i) => {
    if (INSURANCE_PAGE.test(p.markdown)) {
      keep.add(i);
      if (i + 1 < n) keep.add(i + 1); // clauses often run onto the next page
    }
  });
  let selected = [...keep].sort((a, b) => a - b).map((i) => pages[i]);
  // Still too big: keep the densest insurance pages first.
  let size = selected.reduce((s, p) => s + p.markdown.length, 0);
  if (size > FULL_TEXT_CHAR_LIMIT) {
    const score = (p: OcrPage) => (p.markdown.match(new RegExp(INSURANCE_PAGE, "gi")) ?? []).length;
    const ranked = [...selected].sort((a, b) => score(b) - score(a));
    const chosen = new Set<number>();
    size = 0;
    for (const p of ranked) {
      if (size + p.markdown.length > FULL_TEXT_CHAR_LIMIT) continue;
      chosen.add(p.pageNumber);
      size += p.markdown.length;
    }
    selected = selected.filter((p) => chosen.has(p.pageNumber));
  }
  return { pages: selected, trimmed: true };
}

function documentText(filename: string, pages: OcrPage[], trimmed: boolean): string {
  const header = `SOURCE: ${filename}${
    trimmed ? " (long document: only the parties pages and insurance-related pages are included)" : ""
  }`;
  return [header, ...pages.map((p) => `=== PAGE ${p.pageNumber} ===\n${p.markdown}`)].join("\n\n");
}

async function storePdf(
  ctx: { storage: { store: (blob: Blob) => Promise<import("./_generated/dataModel").Id<"_storage">> } },
  req: CertRequirements,
) {
  const bytes = await fillAcord25(req);
  return ctx.storage.store(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

function headline(req: CertRequirements) {
  return {
    projectName:
      req.descriptionOfOperations.structured.projectName ?? req.contractInfo.projectName ?? undefined,
    holderName: req.certificateHolder.name ?? undefined,
    insuredName: req.namedInsured.name ?? undefined,
  };
}

export const run = internalAction({
  args: { requestId: v.id("certRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.runQuery(internal.certRequests.getInternal, { requestId });
    if (!request?.storageId) throw new Error("Certificate request or file not found");
    const started = Date.now();
    const config = getNodeConfig();
    const modelId = config.openai.analysisModel;
    const model = createOpenAI({ apiKey: config.openai.apiKey })(modelId);
    const patch = (p: Record<string, unknown>) =>
      ctx.runMutation(internal.certRequests.patchInternal, { requestId, patch: p });

    try {
      // 1. OCR
      await patch({ status: "reading", errorMessage: "", event: { type: "reading" } });
      const blob = await ctx.storage.get(request.storageId);
      if (!blob) throw new Error("Uploaded file not found in storage");
      const pdfBytes = Buffer.from(await blob.arrayBuffer());
      const ocr = await parsePdfWithOcr(pdfBytes, config.mistral.apiKey);
      if (ocr.pages.length === 0 || ocr.rawMarkdown.trim().length < 50) {
        throw new Error("Could not read any text from this PDF");
      }
      const { pages, trimmed } = selectPages(ocr.pages);
      const text = documentText(request.filename, pages, trimmed);
      log("ocr done", { requestId, pages: ocr.pages.length, sent: pages.length, chars: text.length });

      // 2. Extract (two focused calls in parallel)
      await patch({
        status: "extracting",
        pageCount: ocr.pages.length,
        event: { type: "extracting", detail: `${ocr.pages.length} pages read${trimmed ? `, ${pages.length} insurance pages sent` : ""}` },
      });
      // Short documents also go to the model as the original PDF, so it can
      // see checkboxes and scanned tables the OCR text flattens.
      const attachPdf =
        ocr.pages.length <= ATTACH_PDF_MAX_PAGES && pdfBytes.length <= ATTACH_PDF_MAX_BYTES;
      const messagesFor = (prompt: string) => [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            ...(attachPdf
              ? [
                  {
                    type: "file" as const,
                    data: pdfBytes,
                    mediaType: "application/pdf",
                    filename: request.filename,
                  },
                ]
              : []),
          ],
        },
      ];
      const [coverageResult, partiesResult] = await Promise.all([
        generateObject({
          model,
          schema: coverageExtractionSchema,
          messages: messagesFor(getCoverageExtractionPrompt(text)),
          maxRetries: 3,
        }),
        generateObject({
          model,
          schema: partiesExtractionSchema,
          messages: messagesFor(getPartiesExtractionPrompt(text)),
          maxRetries: 3,
        }),
      ]);

      // 3. Assemble, verify quotes, raise checks
      await patch({ status: "generating" });
      const req = certRequirementsSchema.parse(
        assembleRequirements(coverageResult.object, partiesResult.object),
      );
      const evidence = verifyEvidence(req, ocr.pages);
      const signals = detectDocumentSignals(ocr.rawMarkdown);
      const checks = buildChecks(req, evidence, signals);
      const remarks = buildCertRemarks(req);

      // 4. Fill the example ACORD 25
      const pdfStorageId = await storePdf(ctx, req);
      const json = JSON.stringify(req);
      await ctx.runMutation(internal.certRequests.replacePdf, {
        requestId,
        pdfStorageId,
        patch: {
          status: "complete",
          errorMessage: "",
          extractedRequirements: json,
          requirements: json,
          evidence: JSON.stringify(evidence),
          checks: JSON.stringify(checks),
          docKind: signals.looksLikeIssuedCoi ? "issuedCoi" : "requirements",
          remarks,
          model: modelId,
          inputTokens:
            (coverageResult.usage.inputTokens ?? 0) + (partiesResult.usage.inputTokens ?? 0),
          outputTokens:
            (coverageResult.usage.outputTokens ?? 0) + (partiesResult.usage.outputTokens ?? 0),
          durationMs: Date.now() - started,
          event: {
            type: "complete",
            detail: `${checks.filter((c) => c.severity !== "info").length} items to check`,
          },
          ...headline(req),
        },
      });
      log("complete", { requestId, ms: Date.now() - started, checks: checks.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Certificate generation failed";
      log("failed", { requestId, message });
      await patch({ status: "failed", errorMessage: message.slice(0, 500), event: { type: "failed", detail: message.slice(0, 200) } });
    }
  },
});

/** Re-fill the PDF from stored requirements after an agent edit or reset. */
export const regenerate = internalAction({
  args: {
    requestId: v.id("certRequests"),
    edits: v.optional(
      v.object({
        namedInsuredName: v.union(v.string(), v.null()),
        namedInsuredAddress: v.union(v.string(), v.null()),
        certificateHolderName: v.union(v.string(), v.null()),
        certificateHolderAddress: v.union(v.string(), v.null()),
        projectName: v.union(v.string(), v.null()),
        jobNumber: v.union(v.string(), v.null()),
      }),
    ),
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, { requestId, edits, reset }) => {
    const request = await ctx.runQuery(internal.certRequests.getInternal, { requestId });
    if (!request?.requirements || !request.extractedRequirements) return;
    try {
      const base = certRequirementsSchema.parse(
        JSON.parse(reset ? request.extractedRequirements : request.requirements),
      );
      const req = edits ? applyEdits(base, edits as CertEdits) : base;
      const evidence = JSON.parse(request.evidence ?? "[]") as VerifiedEvidence[];
      const pdfStorageId = await storePdf(ctx, req);
      await ctx.runMutation(internal.certRequests.replacePdf, {
        requestId,
        pdfStorageId,
        patch: {
          status: "complete",
          errorMessage: "",
          // Reset stores the extracted blob verbatim so the UI's "edited"
          // comparison goes back to false.
          requirements: reset ? request.extractedRequirements : JSON.stringify(req),
          checks: JSON.stringify(
            buildChecks(req, evidence, { looksLikeIssuedCoi: request.docKind === "issuedCoi" }),
          ),
          remarks: buildCertRemarks(req),
          event: { type: "regenerated" },
          ...headline(req),
        },
      });
    } catch (error) {
      log("regenerate failed", { requestId, error: String(error) });
      await ctx.runMutation(internal.certRequests.patchInternal, {
        requestId,
        patch: { status: "complete", errorMessage: "Could not apply the edit. Try again." },
      });
    }
  },
});
