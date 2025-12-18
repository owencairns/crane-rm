import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { createAgentTools } from './tools';
import {
  getSystemPrompt,
  getTaskPrompt,
  getCandidateVerificationPrompt,
} from './prompts';
import { config } from '../config';
import { analysisConfig } from '../config/analysis.config';
import type { Provision, CandidateMap, Finding, AnalysisStatus } from '../models/types';
import {
  getContract,
  updateAnalysis,
  updateContract,
  getFindings,
  createFinding,
} from '../services/firebase.service';
import {
  runPreScreening,
  partitionProvisions,
  isEmbeddingCacheReady,
} from '../services/prescreening.service';

export interface AnalysisContext {
  userId: string;
  contractId: string;
  analysisId: string;
  provisions: Provision[];
}

// Batch result tracking
interface BatchResult {
  batchIndex: number;
  success: boolean;
  provisions: Provision[];
  error?: {
    message: string;
    code?: string;
  };
  stepsCompleted?: number;
}

// Logger with timestamps and context
function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '→';
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  console[level](`[${timestamp}] ${prefix} ${message}${contextStr}`);
}

/**
 * Main analysis entry point - implements two-pass architecture.
 */
export async function runAnalysis(context: AnalysisContext): Promise<void> {
  const { userId, contractId, analysisId, provisions } = context;

  log('info', `Starting analysis`, { analysisId, contractId, provisionCount: provisions.length });

  try {
    // Verify embedding cache is ready
    if (!isEmbeddingCacheReady()) {
      throw new Error('Provision embeddings not initialized. Server may still be starting.');
    }

    // Get contract details for context
    const contract = await getContract(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    // Update contract status
    await updateContract(contractId, { status: 'analyzing' });

    log('info', `Starting two-pass analysis for ${provisions.length} provisions`);

    // ==================== PASS 1: PRE-SCREENING ====================
    log('info', '=== PASS 1: Pre-screening (no LLM) ===');
    const candidateMap = await runPreScreening(userId, contractId, provisions);

    // Partition provisions
    const { withCandidates, withoutCandidates } = partitionProvisions(provisions, candidateMap);

    log('info', `Pre-screening complete`, {
      withCandidates: withCandidates.length,
      withoutCandidates: withoutCandidates.length,
    });

    // Auto-record "not found" for provisions without candidates
    if (analysisConfig.features.enableAutoNotFound && withoutCandidates.length > 0) {
      log('info', `Auto-recording ${withoutCandidates.length} provisions as not found`);
      await recordNotFoundBatch(context, withoutCandidates);
    }

    // ==================== PASS 2: LLM VERIFICATION ====================
    log('info', '=== PASS 2: LLM Verification ===');

    let batchResults: BatchResult[] = [];

    if (withCandidates.length === 0) {
      log('info', 'No provisions have candidates - skipping LLM verification');
    } else {
      // Group provisions for LLM batches
      const provisionGroups = groupProvisionsForLLM(withCandidates, candidateMap);

      log('info', `Created ${provisionGroups.length} LLM batches`);

      // Process batches and collect results
      if (analysisConfig.features.enableParallelBatches) {
        batchResults = await runParallelBatches(context, provisionGroups, candidateMap, contract);
      } else {
        batchResults = await runSequentialBatches(context, provisionGroups, candidateMap, contract);
      }
    }

    // ==================== FINALIZE ====================
    await finalizeAnalysis(context, batchResults);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as any)?.code || (error as any)?.data?.error?.code;

    log('error', `Analysis failed`, { analysisId, error: errorMessage, code: errorCode });

    await updateAnalysis(contractId, analysisId, {
      status: 'failed',
      completedAt: new Date(),
      error: {
        message: errorMessage,
        code: errorCode,
      },
    });

    await updateContract(contractId, { status: 'failed' });

    throw error;
  }
}

/**
 * Record "not found" findings for provisions without candidate chunks.
 */
async function recordNotFoundBatch(
  context: AnalysisContext,
  provisions: Provision[]
): Promise<void> {
  const { contractId, analysisId } = context;

  const promises = provisions.map((provision) => {
    const finding: Finding = {
      provisionId: provision.provisionId,
      priority: provision.priority,
      matched: false,
      confidence: 0,
      evidenceChunkIds: [],
      evidencePages: [],
      evidenceExcerpts: [],
      reasoningSummary: 'No candidate chunks found during pre-screening. Provision not present in contract.',
      screeningResult: 'no_candidates',
      createdAt: new Date(),
    };

    return createFinding(contractId, analysisId, provision.provisionId, finding);
  });

  await Promise.all(promises);
}

/**
 * Group provisions into LLM batches based on priority and batch size limits.
 */
function groupProvisionsForLLM(
  provisions: Provision[],
  candidateMap: CandidateMap
): Provision[][] {
  const maxPerBatch = analysisConfig.batching.maxProvisionsPerBatch;

  // First, group by priority
  const byPriority = groupProvisionsByPriority(provisions);
  const priorities = ['critical', 'high', 'medium', 'low'] as const;

  const batches: Provision[][] = [];

  for (const priority of priorities) {
    const group = byPriority[priority] || [];
    if (group.length === 0) continue;

    // Split into smaller batches if needed
    for (let i = 0; i < group.length; i += maxPerBatch) {
      batches.push(group.slice(i, i + maxPerBatch));
    }
  }

  return batches;
}

/**
 * Run LLM batches in parallel with concurrency limit.
 */
async function runParallelBatches(
  context: AnalysisContext,
  batches: Provision[][],
  candidateMap: CandidateMap,
  contract: any
): Promise<BatchResult[]> {
  const maxConcurrent = analysisConfig.llm.maxConcurrentBatches;

  log('info', `Running ${batches.length} batches with max ${maxConcurrent} concurrent`);

  // Simple concurrency limiter
  const results: Promise<BatchResult>[] = [];
  let running = 0;
  let index = 0;

  const runNext = async (): Promise<void> => {
    while (index < batches.length && running < maxConcurrent) {
      const batchIndex = index++;
      running++;

      const batchPromise = runSingleBatch(context, batches[batchIndex], candidateMap, contract, batchIndex)
        .finally(() => {
          running--;
        });

      results.push(batchPromise);

      // If at max concurrency, wait for one to complete
      if (running >= maxConcurrent && index < batches.length) {
        await Promise.race(results.filter((_, i) => i >= results.length - running));
      }
    }
  };

  await runNext();
  return Promise.all(results);
}

/**
 * Run LLM batches sequentially (fallback mode).
 */
async function runSequentialBatches(
  context: AnalysisContext,
  batches: Provision[][],
  candidateMap: CandidateMap,
  contract: any
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (let i = 0; i < batches.length; i++) {
    const result = await runSingleBatch(context, batches[i], candidateMap, contract, i);
    results.push(result);
  }
  return results;
}

/**
 * Run a single LLM batch for verification.
 */
async function runSingleBatch(
  context: AnalysisContext,
  provisions: Provision[],
  candidateMap: CandidateMap,
  contract: any,
  batchIndex: number
): Promise<BatchResult> {
  const { userId, contractId, analysisId } = context;
  const batchPriority = provisions[0]?.priority || 'medium';
  const provisionIds = provisions.map(p => p.provisionId);

  log('info', `Batch ${batchIndex + 1}: Starting`, {
    provisions: provisions.length,
    priority: batchPriority,
    provisionIds,
  });

  try {
    // Create tools for this batch
    const tools = createAgentTools({ userId, contractId, analysisId });

    // Get prompts
    const systemPrompt = getSystemPrompt();
    const taskPrompt = getTaskPrompt({
      gcName: contract.gcName,
      state: contract.state,
      projectName: contract.projectName,
    });

    // Get candidate verification prompt with pre-found chunks
    const verificationPrompt = getCandidateVerificationPrompt(provisions, candidateMap);
    const fullPrompt = `${taskPrompt}\n\n${verificationPrompt}`;

    // Get step limit for this priority
    const stepLimit = analysisConfig.llm.stepLimits[batchPriority as keyof typeof analysisConfig.llm.stepLimits]
      || analysisConfig.llm.defaultStepLimit;

    // Create agent instance with Gemini 3 Flash (1M token context, 3x faster than 2.5 Pro)
    const agent = new Agent({
      model: google('gemini-3-flash-preview'),
      instructions: systemPrompt,
      tools,
      stopWhen: stepCountIs(stepLimit),
    });

    const result = await agent.generate({
      prompt: fullPrompt,
    });

    const stepsCompleted = result.steps?.length || 0;
    log('info', `Batch ${batchIndex + 1}: Complete`, { steps: stepsCompleted });

    return {
      batchIndex,
      success: true,
      provisions,
      stepsCompleted,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as any)?.code || (error as any)?.data?.error?.code;

    log('error', `Batch ${batchIndex + 1}: Failed`, {
      error: errorMessage,
      code: errorCode,
      provisionIds,
    });

    return {
      batchIndex,
      success: false,
      provisions,
      error: {
        message: errorMessage,
        code: errorCode,
      },
    };
  }
}

/**
 * Finalize analysis - calculate summary counts and update status.
 */
async function finalizeAnalysis(context: AnalysisContext, batchResults: BatchResult[]): Promise<void> {
  const { contractId, analysisId, provisions: allProvisions } = context;

  // Analyze batch results
  const successfulBatches = batchResults.filter(r => r.success);
  const failedBatches = batchResults.filter(r => !r.success);

  log('info', 'Finalizing analysis', {
    totalBatches: batchResults.length,
    succeeded: successfulBatches.length,
    failed: failedBatches.length,
  });

  // Record error findings for provisions in failed batches
  if (failedBatches.length > 0) {
    const failedProvisions = failedBatches.flatMap(b => b.provisions);
    log('warn', `Recording ${failedProvisions.length} provisions as errors due to batch failures`);

    await recordErrorBatch(context, failedProvisions, failedBatches[0]?.error?.message || 'Batch processing failed');
  }

  // Get current findings and ensure all provisions are accounted for
  let findings = await getFindings(contractId, analysisId);

  // Find provisions that don't have findings recorded
  const recordedProvisionIds = new Set(findings.map(f => f.provisionId));
  const missingProvisions = allProvisions.filter(p => !recordedProvisionIds.has(p.provisionId));

  if (missingProvisions.length > 0) {
    log('warn', `Found ${missingProvisions.length} provisions without findings - recording as not analyzed`, {
      missingProvisionIds: missingProvisions.map(p => p.provisionId),
    });

    await recordMissingBatch(context, missingProvisions);

    // Refresh findings after recording missing ones
    findings = await getFindings(contractId, analysisId);
  }

  // Calculate summary counts
  const summaryCounts = {
    criticalMatched: findings.filter((f) => f.priority === 'critical' && f.matched).length,
    highMatched: findings.filter((f) => f.priority === 'high' && f.matched).length,
    mediumMatched: findings.filter((f) => f.priority === 'medium' && f.matched).length,
    lowMatched: findings.filter((f) => f.priority === 'low' && f.matched).length,
  };

  // Determine final status
  let status: AnalysisStatus;
  let errorInfo: { message: string; code?: string; batchesFailed?: number; batchesSucceeded?: number; failedProvisionIds?: string[] } | undefined;

  if (failedBatches.length === 0) {
    status = 'complete';
    log('info', '✅ Analysis completed successfully');
  } else if (successfulBatches.length === 0 && batchResults.length > 0) {
    status = 'failed';
    errorInfo = {
      message: 'All batches failed',
      code: failedBatches[0]?.error?.code,
      batchesFailed: failedBatches.length,
      batchesSucceeded: 0,
      failedProvisionIds: failedBatches.flatMap(b => b.provisions.map(p => p.provisionId)),
    };
    log('error', '❌ Analysis failed - all batches failed', errorInfo);
  } else {
    status = 'partial';
    errorInfo = {
      message: `${failedBatches.length} of ${batchResults.length} batches failed`,
      code: failedBatches[0]?.error?.code,
      batchesFailed: failedBatches.length,
      batchesSucceeded: successfulBatches.length,
      failedProvisionIds: failedBatches.flatMap(b => b.provisions.map(p => p.provisionId)),
    };
    log('warn', '⚠️ Analysis completed with errors', errorInfo);
  }

  // Update analysis
  await updateAnalysis(contractId, analysisId, {
    status,
    completedAt: new Date(),
    summaryCounts,
    ...(errorInfo && { error: errorInfo }),
  });

  // Update contract status (use 'complete' even for partial, so user can see results)
  const contractStatus = status === 'failed' ? 'failed' : 'complete';
  await updateContract(contractId, { status: contractStatus });

  log('info', `Analysis finalized`, {
    status,
    totalFindings: findings.length,
    matched: summaryCounts,
  });
}

/**
 * Record error findings for provisions that failed due to batch errors.
 */
async function recordErrorBatch(
  context: AnalysisContext,
  provisions: Provision[],
  errorMessage: string
): Promise<void> {
  const { contractId, analysisId } = context;

  const promises = provisions.map((provision) => {
    const finding: Finding = {
      provisionId: provision.provisionId,
      priority: provision.priority,
      matched: false,
      confidence: 0,
      evidenceChunkIds: [],
      evidencePages: [],
      evidenceExcerpts: [],
      reasoningSummary: `Analysis error: ${errorMessage}. Please retry the analysis.`,
      screeningResult: 'error',
      createdAt: new Date(),
    };

    return createFinding(contractId, analysisId, provision.provisionId, finding);
  });

  await Promise.all(promises);
}

/**
 * Record findings for provisions that were missed by the LLM agent.
 * This ensures all provisions are accounted for in the results.
 */
async function recordMissingBatch(
  context: AnalysisContext,
  provisions: Provision[]
): Promise<void> {
  const { contractId, analysisId } = context;

  const promises = provisions.map((provision) => {
    const finding: Finding = {
      provisionId: provision.provisionId,
      priority: provision.priority,
      matched: false,
      confidence: 0,
      evidenceChunkIds: [],
      evidencePages: [],
      evidenceExcerpts: [],
      reasoningSummary: 'Provision was not fully analyzed due to processing limits. Marked as not found by default.',
      screeningResult: 'not_analyzed',
      createdAt: new Date(),
    };

    return createFinding(contractId, analysisId, provision.provisionId, finding);
  });

  await Promise.all(promises);
}

/**
 * Group provisions by priority.
 */
function groupProvisionsByPriority(provisions: Provision[]): Record<string, Provision[]> {
  return provisions.reduce((acc, provision) => {
    const priority = provision.priority;
    if (!acc[priority]) {
      acc[priority] = [];
    }
    acc[priority].push(provision);
    return acc;
  }, {} as Record<string, Provision[]>);
}
