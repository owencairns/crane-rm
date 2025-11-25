import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
import { createAgentTools } from './tools';
import { getSystemPrompt, getTaskPrompt, getProvisionPrompt } from './prompts';
import { config } from '../config';
import type { Provision } from '../models/types';
import {
  getContract,
  updateAnalysis,
  updateContract,
  getFindings,
} from '../services/firebase.service';

export interface AnalysisContext {
  userId: string;
  contractId: string;
  analysisId: string;
  provisions: Provision[];
}

export async function runAnalysis(context: AnalysisContext): Promise<void> {
  const { userId, contractId, analysisId, provisions } = context;

  try {
    // Get contract details for context
    const contract = await getContract(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    // Update contract status
    await updateContract(contractId, { status: 'analyzing' });

    // Create tools for this analysis
    const tools = createAgentTools({ userId, contractId, analysisId });

    // Get prompts
    const systemPrompt = getSystemPrompt();
    const taskPrompt = getTaskPrompt({
      gcName: contract.gcName,
      state: contract.state,
      projectName: contract.projectName,
    });

    // Sort provisions by priority
    const sortedProvisions = sortProvisionsByPriority(provisions);

    // Create agent instance with AI SDK v6
    const agent = new Agent({
      model: openai(config.openai.analysisModel),
      instructions: systemPrompt,
      tools,
      stopWhen: stepCountIs(20), // Allow up to 20 steps for thorough analysis
    });

    console.log(`Starting sequential analysis of ${sortedProvisions.length} provisions...`);

    // Process each provision sequentially to avoid rate limits
    for (const provision of sortedProvisions) {
      console.log(
        `Analyzing provision: ${provision.provisionId} (${provision.priority})`
      );

      const provisionPrompt = getProvisionPrompt(provision);
      const fullPrompt = `${taskPrompt}\n\n${provisionPrompt}`;

      try {
        console.log(`Starting agent.generate() for ${provision.provisionId}...`);

        const result = await agent.generate({
          prompt: fullPrompt,
        });

        console.log(`Provision ${provision.provisionId} result:`, result.text || 'No text output');
        console.log(`Steps taken: ${result.steps?.length || 0}`);

        if (result.steps && result.steps.length > 0) {
          console.log(`Step details for ${provision.provisionId}:`);
          result.steps.forEach((step: any, idx: number) => {
            console.log(`  Step ${idx + 1}:`);
            if (step.toolCalls) {
              console.log(`    Tool calls: ${step.toolCalls.length}`);
              step.toolCalls.forEach((tc: any) => {
                console.log(`      - ${tc.toolName}`);
              });
            }
            if (step.toolResults) {
              console.log(`    Tool results: ${step.toolResults.length}`);
            }
          });
        }

        console.log(`✅ Completed provision: ${provision.provisionId}`);
      } catch (error) {
        console.error(
          `❌ Error analyzing provision ${provision.provisionId}:`,
          error
        );
        // Continue with other provisions even if one fails
      }
    }

    // Calculate summary counts
    const findings = await getFindings(contractId, analysisId);
    const summaryCounts = {
      criticalMatched: findings.filter(
        (f) => f.priority === 'critical' && f.matched
      ).length,
      highMatched: findings.filter((f) => f.priority === 'high' && f.matched)
        .length,
      mediumMatched: findings.filter(
        (f) => f.priority === 'medium' && f.matched
      ).length,
      lowMatched: findings.filter((f) => f.priority === 'low' && f.matched)
        .length,
    };

    // Update analysis as complete
    await updateAnalysis(contractId, analysisId, {
      status: 'complete',
      completedAt: new Date(),
      summaryCounts,
    });

    // Update contract status
    await updateContract(contractId, { status: 'complete' });

    console.log(
      `Analysis ${analysisId} completed successfully with ${findings.length} findings`
    );
  } catch (error) {
    console.error(`Analysis ${analysisId} failed:`, error);

    // Mark as failed
    await updateAnalysis(contractId, analysisId, {
      status: 'failed',
      completedAt: new Date(),
    });

    await updateContract(contractId, { status: 'failed' });

    throw error;
  }
}

function sortProvisionsByPriority(provisions: Provision[]): Provision[] {
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...provisions].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}
