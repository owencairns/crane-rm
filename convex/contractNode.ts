"use node";

import { Experimental_Agent as Agent, generateText, stepCountIs, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { analysisConfig } from "./lib/analysisConfig";
import { generateChunkId, parsePdfWithOcr, chunkOcrPages } from "./lib/pdf";
import { getSystemPrompt, getAnalysisPrompt } from "./lib/prompts";
import { getProvisionCatalog, getProvisionCatalogVersion } from "./lib/provisions";
import { getNodeConfig } from "./lib/nodeConfig";
import type {
  ChunkRecord,
  ContractRecord,
  FindingRecord,
} from "./lib/types";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getOpenAIProvider() {
  return createOpenAI({ apiKey: getNodeConfig().openai.apiKey });
}

async function generateExecutiveSummary(
  modelName: string,
  contract: ContractRecord,
  findings: FindingRecord[]
): Promise<string | undefined> {
  const matched = findings.filter((f) => f.matched);
  const concerns = matched.filter(
    (f) => f.priority === "critical" || f.priority === "high"
  );
  const concernList = concerns
    .slice(0, 20)
    .map((f) => `- [${f.priority.toUpperCase()}] ${f.provisionId}: ${f.reasoningSummary}`)
    .join("\n");

  const contextLines = [
    contract.gcName ? `General Contractor: ${contract.gcName}` : null,
    contract.projectName ? `Project: ${contract.projectName}` : null,
    contract.state ? `State: ${contract.state}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `You are a crane/rigging insurance broker. Read these contract analysis findings and write a 2-3 sentence executive summary for a broker who wants to know at a glance whether to worry. Plain language, action-oriented, no fluff. Do not list each finding — synthesize the overall risk picture and the top concerns.

${contextLines}

Total provisions checked: ${findings.length}
Matched: ${matched.length} (${concerns.length} critical/high)

Top concerns:
${concernList || "(none of concern)"}

Write the 2-3 sentence executive summary now. Speak directly to the broker; no preamble.`;

  try {
    const result = await generateText({
      model: getOpenAIProvider()(modelName),
      prompt,
    });
    return result.text.trim();
  } catch (error) {
    log("Executive summary generation failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return undefined;
  }
}

function log(message: string, ctx?: Record<string, unknown>) {
  const suffix = ctx ? ` ${JSON.stringify(ctx)}` : "";
  console.log(`[contractNode] ${message}${suffix}`);
}

async function requireActionUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthorized");
  return identity.subject;
}

/* ------------------------------------------------------------------ */
/*  Agent tools                                                       */
/* ------------------------------------------------------------------ */

function createAgentTools(
  ctx: ActionCtx,
  contractId: Id<"contracts">,
  analysisId: Id<"analyses">,
  ownerId: string
) {
  return {
    keyword_search: tool({
      description:
        "Search for keywords or phrases across all contract chunks. Returns matching snippets with context. Use this to find specific clauses, terms, or legal phrases.",
      inputSchema: z.object({
        patterns: z
          .array(z.string())
          .describe("Keywords or phrases to search for (case-insensitive)"),
      }),
      execute: async ({ patterns }) => {
        const chunks = (await ctx.runQuery(
          internal.contracts.getAllChunksForContract,
          { contractId }
        )) as ChunkRecord[];

        const matches: Array<{
          chunkId: string;
          page: number;
          pattern: string;
          snippet: string;
        }> = [];

        for (const chunk of chunks) {
          const lower = chunk.text.toLowerCase();
          for (const pattern of patterns) {
            const idx = lower.indexOf(pattern.toLowerCase());
            if (idx === -1) continue;
            const start = Math.max(0, idx - 200);
            const end = Math.min(chunk.text.length, idx + pattern.length + 200);
            matches.push({
              chunkId: chunk.chunkId,
              page: chunk.pageStart,
              pattern,
              snippet: `...${chunk.text.slice(start, end)}...`,
            });
          }
        }
        return { matches, totalMatches: matches.length };
      },
    }),

    get_chunk: tool({
      description:
        "Retrieve the full text of a contract chunk by its ID. Use after keyword_search to read complete context.",
      inputSchema: z.object({ chunkId: z.string() }),
      execute: async ({ chunkId }) => {
        return ctx.runQuery(internal.contracts.getChunkByChunkId, { chunkId });
      },
    }),

    get_adjacent_chunks: tool({
      description:
        "Retrieve chunks before/after a given chunk for surrounding context.",
      inputSchema: z.object({
        chunkId: z.string(),
        window: z.number().optional().default(1),
      }),
      execute: async ({ chunkId, window }) => {
        return ctx.runQuery(internal.contracts.getAdjacentChunks, {
          contractId,
          chunkId,
          window,
        });
      },
    }),

    get_image: tool({
      description:
        "Retrieve an image extracted from the contract by its index (from [IMAGE #N] references in text).",
      inputSchema: z.object({
        imageIndex: z.number(),
      }),
      execute: async ({ imageIndex }) => {
        return ctx.runQuery(internal.contracts.getImageByIndex, {
          contractId,
          imageIndex,
        });
      },
    }),

    record_finding: tool({
      description:
        "Record your finding for a single provision. Call this for EVERY provision — even if not found (matched=false, confidence=0).",
      inputSchema: z.object({
        provisionId: z.string(),
        priority: z.enum(["critical", "high", "medium", "low"]),
        matched: z.boolean(),
        confidence: z.number().min(0).max(1),
        evidenceChunkIds: z.array(z.string()),
        evidencePages: z.array(z.number()),
        evidenceExcerpts: z.array(z.string()),
        reasoningSummary: z.string(),
        recommendedAction: z.string().optional(),
      }),
      execute: async (finding) => {
        await ctx.runMutation(internal.contracts.upsertFindings, {
          contractId,
          analysisId,
          ownerId,
          findings: [
            {
              ...finding,
              screeningResult: finding.matched
                ? "analyzed_found"
                : "analyzed_not_found",
              createdAt: Date.now(),
            },
          ],
        });
        return { ok: true, provisionId: finding.provisionId };
      },
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  Analysis workflow                                                  */
/* ------------------------------------------------------------------ */

async function runAnalysis(
  ctx: ActionCtx,
  ownerId: string,
  contract: ContractRecord
) {
  const config = getNodeConfig();
  const provisions = getProvisionCatalog();

  const analysisId = await ctx.runMutation(internal.contracts.createAnalysis, {
    contractId: contract._id,
    ownerId,
    model: config.openai.analysisModel,
    startedAt: Date.now(),
  });

  await ctx.runMutation(internal.contracts.patchContract, {
    contractId: contract._id,
    patch: { status: "analyzing", updatedAt: Date.now() },
  });

  log("Starting agent", {
    contractId: contract._id,
    provisions: provisions.length,
    model: config.openai.analysisModel,
  });

  try {
    const tools = createAgentTools(ctx, contract._id, analysisId, ownerId);

    const agent = new Agent({
      model: getOpenAIProvider()(config.openai.analysisModel),
      instructions: getSystemPrompt(),
      tools,
      stopWhen: stepCountIs(analysisConfig.llm.maxSteps),
    });

    const result = await agent.generate({
      prompt: getAnalysisPrompt(provisions, {
        gcName: contract.gcName,
        state: contract.state,
        projectName: contract.projectName,
      }),
    });

    log("Agent finished", { steps: result.steps?.length });
  } catch (error) {
    log("Agent error", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  // Ensure every provision has a finding — fill gaps as "not_analyzed"
  const findings = (await ctx.runQuery(
    internal.contracts.getFindingsForAnalysis,
    { analysisId }
  )) as FindingRecord[];

  const recorded = new Set(findings.map((f) => f.provisionId));
  const missing = provisions.filter((p) => !recorded.has(p.provisionId));

  if (missing.length > 0) {
    log("Recording unanalyzed provisions", { count: missing.length });
    await ctx.runMutation(internal.contracts.upsertFindings, {
      contractId: contract._id,
      analysisId,
      ownerId,
      findings: missing.map((p) => ({
        provisionId: p.provisionId,
        priority: p.priority,
        matched: false,
        confidence: 0,
        evidenceChunkIds: [],
        evidencePages: [],
        evidenceExcerpts: [],
        reasoningSummary:
          "Provision was not analyzed due to processing limits.",
        screeningResult: "not_analyzed",
        createdAt: Date.now(),
      })),
    });
  }

  // Compute final state
  const finalFindings = (await ctx.runQuery(
    internal.contracts.getFindingsForAnalysis,
    { analysisId }
  )) as FindingRecord[];

  const summaryCounts = {
    criticalMatched: finalFindings.filter((f) => f.priority === "critical" && f.matched).length,
    highMatched: finalFindings.filter((f) => f.priority === "high" && f.matched).length,
    mediumMatched: finalFindings.filter((f) => f.priority === "medium" && f.matched).length,
    lowMatched: finalFindings.filter((f) => f.priority === "low" && f.matched).length,
  };

  const hasErrors = missing.length > 0;
  const status = hasErrors ? "partial" : "complete";

  const riskScore = Math.min(
    100,
    finalFindings
      .filter((f) => !f.matched)
      .reduce((sum, f) => {
        const w: Record<string, number> = { critical: 30, high: 20, medium: 10, low: 5 };
        return sum + (w[f.priority] || 0);
      }, 0)
  );

  const summary = await generateExecutiveSummary(
    config.openai.analysisModel,
    contract,
    finalFindings
  );

  await ctx.runMutation(internal.contracts.patchAnalysis, {
    analysisId,
    patch: {
      status,
      completedAt: Date.now(),
      summaryCounts,
      ...(summary && { summary }),
      ...(hasErrors && {
        error: {
          message: `${missing.length} provisions not analyzed within step limit`,
        },
      }),
    },
  });

  await ctx.runMutation(internal.contracts.patchContract, {
    contractId: contract._id,
    patch: {
      status: "complete",
      riskScore,
      updatedAt: Date.now(),
    },
  });

  log("Analysis complete", {
    status,
    riskScore,
    recorded: finalFindings.length,
    missing: missing.length,
  });
}

export const backfillSummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    const targets = (await ctx.runQuery(
      internal.contracts.listAnalysesMissingSummary,
      {}
    )) as Array<{ _id: Id<"analyses">; contractId: Id<"contracts">; model: string }>;

    let updated = 0;
    for (const target of targets) {
      const contract = (await ctx.runQuery(internal.contracts.getContractRecord, {
        contractId: target.contractId,
      })) as ContractRecord | null;
      if (!contract) continue;

      const findings = (await ctx.runQuery(
        internal.contracts.getFindingsForAnalysis,
        { analysisId: target._id }
      )) as FindingRecord[];

      const summary = await generateExecutiveSummary(target.model, contract, findings);
      if (!summary) continue;

      await ctx.runMutation(internal.contracts.patchAnalysis, {
        analysisId: target._id,
        patch: { summary },
      });
      updated++;
    }

    log("Backfill complete", { found: targets.length, updated });
    return { found: targets.length, updated };
  },
});

/* ------------------------------------------------------------------ */
/*  Ingest action                                                     */
/* ------------------------------------------------------------------ */

export const ingestContract = internalAction({
  args: {
    contractId: v.id("contracts"),
    ownerId: v.string(),
  },
  handler: async (ctx, { contractId, ownerId }) => {
    const contract = (await ctx.runQuery(
      internal.contracts.getContractRecord,
      { contractId }
    )) as ContractRecord | null;

    if (!contract || contract.ownerId !== ownerId || !contract.storageId) {
      throw new Error("Contract not found or inaccessible");
    }

    try {
      log("Starting ingest", { contractId });

      const fileBlob = await ctx.storage.get(contract.storageId);
      if (!fileBlob) throw new Error("Uploaded file not found in storage");
      const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());

      // OCR
      await ctx.runMutation(internal.contracts.patchContract, {
        contractId,
        patch: { status: "parsing", updatedAt: Date.now() },
      });

      const nodeConfig = getNodeConfig();
      log("Calling GLM OCR", { contractId, pdfSizeBytes: pdfBuffer.length });
      const ocrResult = await parsePdfWithOcr(pdfBuffer, nodeConfig.zai.apiKey);
      log("OCR complete", {
        contractId,
        pages: ocrResult.pageCount,
        markdownLength: ocrResult.rawMarkdown.length,
      });

      // Store images
      const allImages: Array<{ url: string; altText: string; pageNumber: number }> = [];
      for (const page of ocrResult.pages) {
        for (const img of page.images) {
          allImages.push({ ...img, pageNumber: page.pageNumber });
        }
      }

      const storedImages: Array<{
        contractId: Id<"contracts">;
        imageIndex: number;
        storageId: Id<"_storage">;
        pageNumber: number;
        altText: string;
      }> = [];

      for (let i = 0; i < allImages.length; i++) {
        const imgRef = allImages[i].url;
        try {
          let blob: Blob;
          if (imgRef.startsWith("http://") || imgRef.startsWith("https://")) {
            const resp = await fetch(imgRef);
            if (!resp.ok) continue;
            blob = await resp.blob();
          } else if (imgRef.startsWith("data:")) {
            const match = imgRef.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) continue;
            blob = new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
          } else {
            continue; // bbox coordinates — skip
          }
          const storageId = await ctx.storage.store(blob);
          storedImages.push({
            contractId, imageIndex: i, storageId,
            pageNumber: allImages[i].pageNumber, altText: allImages[i].altText,
          });
        } catch {
          // skip failed images
        }
      }

      if (storedImages.length > 0) {
        await ctx.runMutation(internal.contracts.insertImages, { images: storedImages });
      }

      // Chunk
      const { chunks } = chunkOcrPages(ocrResult.pages, 0);
      log("Chunked", { chunkCount: chunks.length });

      const chunkRecords = chunks.map((chunk, i) => ({
        ownerId,
        contractId,
        chunkId: generateChunkId(contractId, i),
        chunkIndex: i,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionPath: chunk.sectionPath,
        text: chunk.text,
        textHash: chunk.textHash,
      }));

      await ctx.runMutation(internal.contracts.insertChunks, { chunks: chunkRecords });

      await ctx.runMutation(internal.contracts.patchContract, {
        contractId,
        patch: {
          pageCount: ocrResult.pageCount,
          chunkCount: chunks.length,
          provisionCatalogVersion: getProvisionCatalogVersion(),
          updatedAt: Date.now(),
        },
      });

      // Run analysis
      await runAnalysis(ctx, ownerId, {
        ...contract,
        pageCount: ocrResult.pageCount,
        chunkCount: chunks.length,
        provisionCatalogVersion: getProvisionCatalogVersion(),
      });
    } catch (error) {
      log("Ingest failed", {
        contractId,
        error: error instanceof Error ? error.message : "unknown",
      });
      await ctx.runMutation(internal.contracts.patchContract, {
        contractId,
        patch: { status: "failed", updatedAt: Date.now() },
      });
      throw error;
    }
  },
});

/* ------------------------------------------------------------------ */
/*  Delete action                                                     */
/* ------------------------------------------------------------------ */

export const deleteContract = action({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, { contractId }) => {
    const ownerId = await requireActionUserId(ctx);
    const contract = (await ctx.runQuery(
      internal.contracts.getContractRecord,
      { contractId }
    )) as ContractRecord | null;

    if (!contract || contract.ownerId !== ownerId) {
      throw new ConvexError("Contract not found");
    }

    if (contract.storageId) await ctx.storage.delete(contract.storageId);
    await ctx.runMutation(internal.contracts.deleteContractGraph, { contractId });
    return { contractId, message: "Contract deleted successfully" };
  },
});
