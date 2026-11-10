"use node";

import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { parsePdfWithOcr } from "./lib/pdf";
import { getNodeConfig } from "./lib/nodeConfig";
import {
  policyExtractionSchema,
  type FinancialInputs,
  type PolicyExtraction,
  type PolicyLine,
} from "./lib/auditGuardSchemas";
import {
  getPolicyExtractionPrompt,
  getPolicyOverseerPrompt,
  auditGuardOverseerResultSchema,
} from "./lib/auditGuardPrompts";
import {
  deriveInputRequests,
  computeEstimates,
  dedupeLines,
} from "./lib/auditGuardCompute";
import { applyOverseerCorrections } from "./lib/auditGuardCorrections";

function getOpenAIProvider() {
  return createOpenAI({ apiKey: getNodeConfig().openai.apiKey });
}

function log(message: string, ctx?: Record<string, unknown>) {
  const suffix = ctx ? ` ${JSON.stringify(ctx)}` : "";
  console.log(`[auditGuardNode] ${message}${suffix}`);
}

/* ------------------------------------------------------------------ */
/*  OCR                                                               */
/* ------------------------------------------------------------------ */

async function ocrPolicyPackage(
  ctx: ActionCtx,
  files: Array<{ filename: string; storageId: Id<"_storage"> }>,
  mistralApiKey: string
): Promise<string> {
  const parts = await Promise.all(
    files.map(async (file, index) => {
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) throw new Error("Uploaded file not found in storage");
      const buffer = Buffer.from(await blob.arrayBuffer());
      const result = await parsePdfWithOcr(buffer, mistralApiKey);
      const label = `POLICY DOCUMENT ${index + 1}: ${file.filename}`;
      return [
        `# ${label}`,
        ...result.pages.map((page) =>
          [`## ${label} - PDF PAGE ${page.pageNumber}`, page.markdown].join(
            "\n\n"
          )
        ),
      ].join("\n\n");
    })
  );
  return parts.join("\n\n---\n\n");
}

/* ------------------------------------------------------------------ */
/*  Stage 1 — ingest policies, derive the input checklist             */
/* ------------------------------------------------------------------ */

export const ingestPolicies = internalAction({
  args: {
    reviewId: v.id("auditGuardReviews"),
    ownerId: v.string(),
  },
  handler: async (ctx, { reviewId, ownerId }) => {
    const review = await ctx.runQuery(
      internal.auditGuardReviews.getReviewRecord,
      { reviewId }
    );

    if (
      !review ||
      review.ownerId !== ownerId ||
      !review.policyStorageIds?.length
    ) {
      throw new Error("Review not found or inaccessible");
    }

    const config = getNodeConfig();
    const model = getOpenAIProvider()(config.openai.analysisModel);
    const overseerModel = getOpenAIProvider()(config.openai.coiOverseerModel);

    try {
      /* ---- 1. OCR the policy package ---- */
      await ctx.runMutation(internal.auditGuardReviews.patchReview, {
        reviewId,
        patch: { status: "parsing", updatedAt: Date.now() },
      });

      const policyFiles = review.policyStorageIds.map((storageId, index) => ({
        storageId,
        filename: review.policyFilenames[index] ?? `Policy ${index + 1}`,
      }));

      log("OCR policy package", { reviewId, files: policyFiles.length });
      const policyMarkdown = await ocrPolicyPackage(
        ctx,
        policyFiles,
        config.mistral.apiKey
      );

      /* ---- 2. Extract per-line rating bases ---- */
      await ctx.runMutation(internal.auditGuardReviews.patchReview, {
        reviewId,
        patch: { status: "extracting", updatedAt: Date.now() },
      });

      log("Extracting policy lines", { reviewId });
      const extractionResult = await generateObject({
        model,
        schema: policyExtractionSchema,
        prompt: getPolicyExtractionPrompt(policyMarkdown),
      });

      /* ---- 3. Overseer audit of the extraction ---- */
      log("Overseer audit of extraction", { reviewId });
      const overseerResult = await generateObject({
        model: overseerModel,
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

      log("Overseer corrections applied", {
        reviewId,
        corrections: overseerResult.object.corrections.length,
        lineCount: extraction.lines.length,
      });

      /* ---- 4. Persist lines + derive the input checklist ---- */
      const lines: PolicyLine[] = extraction.lines;
      const inputRequests = deriveInputRequests(lines);

      await ctx.runMutation(internal.auditGuardReviews.replaceLines, {
        reviewId,
        ownerId,
        lines: lines.map((line) => ({
          ...line,
          evidenceExcerpts: line.evidence.map((e) => e.excerpt),
          citations: line.evidence.map((e) => ({
            page: e.page,
            excerpt: e.excerpt,
          })),
        })),
      });

      await ctx.runMutation(internal.auditGuardReviews.patchReview, {
        reviewId,
        patch: {
          clientName: extraction.clientName ?? undefined,
          policyData: JSON.stringify(extraction),
          inputRequests: JSON.stringify(inputRequests),
          status: "awaiting_inputs",
          updatedAt: Date.now(),
        },
      });

      log("Awaiting financial inputs", {
        reviewId,
        inputs: inputRequests.length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingest error";
      log("Ingest failed", { reviewId, message });
      await ctx.runMutation(internal.auditGuardReviews.patchReview, {
        reviewId,
        patch: {
          status: "failed",
          errorMessage: message,
          updatedAt: Date.now(),
        },
      });
    }
  },
});

/* ------------------------------------------------------------------ */
/*  Stage 2 — deterministic estimate from supplied financials         */
/* ------------------------------------------------------------------ */

export const generateEstimate = internalAction({
  args: {
    reviewId: v.id("auditGuardReviews"),
    ownerId: v.string(),
  },
  handler: async (ctx, { reviewId, ownerId }) => {
    const review = await ctx.runQuery(
      internal.auditGuardReviews.getReviewRecord,
      { reviewId }
    );

    if (
      !review ||
      review.ownerId !== ownerId ||
      !review.policyData ||
      !review.financialInputs
    ) {
      throw new Error("Review not ready for estimate");
    }

    try {
      const extraction = JSON.parse(review.policyData) as PolicyExtraction;
      const inputs = JSON.parse(review.financialInputs) as FinancialInputs;

      const { estimates, summary } = computeEstimates(
        extraction.lines,
        inputs,
        {
          minimumPremium: extraction.minimumPremium,
          expenseConstant: extraction.expenseConstant,
        }
      );

      await ctx.runMutation(internal.auditGuardReviews.applyLineEstimates, {
        reviewId,
        estimates,
      });

      await ctx.runMutation(internal.auditGuardReviews.patchReview, {
        reviewId,
        patch: {
          estimateSummary: summary,
          status: "complete",
          updatedAt: Date.now(),
        },
      });

      log("Estimate complete", {
        reviewId,
        estimatedLines: summary.estimatedLineCount,
        totalAdditional: summary.totalAdditionalPremium,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown estimate error";
      log("Estimate failed", { reviewId, message });
      await ctx.runMutation(internal.auditGuardReviews.patchReview, {
        reviewId,
        patch: {
          status: "failed",
          errorMessage: message,
          updatedAt: Date.now(),
        },
      });
    }
  },
});
