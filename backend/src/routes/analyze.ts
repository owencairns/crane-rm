import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getContract,
  createAnalysis,
  verifyContractOwnership,
} from '../services/firebase.service';
import { runAnalysis } from '../agents/runner';
import { getProvisionCatalog } from '../services/provision.service';
import type { Analysis } from '../models/types';

const router = Router();

// POST /analyze/:contractId - Start analysis
router.post('/:contractId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.userId!;

    console.log(`\n=== ANALYSIS REQUEST RECEIVED ===`);
    console.log(`Contract ID: ${contractId}`);
    console.log(`User ID: ${userId}`);

    // Verify ownership
    const hasAccess = await verifyContractOwnership(contractId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get contract
    const contract = await getContract(contractId);
    if (!contract) {
      console.log(`❌ Contract ${contractId} not found`);
      return res.status(404).json({ error: 'Contract not found' });
    }

    console.log(`Contract status: ${contract.status}`);

    if (contract.status !== 'embedded') {
      console.log(`❌ Cannot analyze - contract status is "${contract.status}", needs to be "embedded"`);
      return res.status(400).json({
        error: `Contract must be embedded before analysis. Current status: ${contract.status}`,
      });
    }

    console.log(`✅ Contract is embedded, proceeding with analysis...`);

    // Create analysis record
    const analysisId = uuidv4();
    const analysis: Analysis = {
      userId,
      contractId,
      startedAt: new Date(),
      model: 'gpt-4o-mini',
      status: 'running',
    };

    await createAnalysis(contractId, analysisId, analysis);

    // Start analysis in background
    const provisions = getProvisionCatalog();

    runAnalysisAsync(userId, contractId, analysisId, provisions)
      .then(() => console.log(`Analysis ${analysisId} completed`))
      .catch((error) =>
        console.error(`Analysis ${analysisId} failed:`, error)
      );

    res.json({
      message: 'Analysis started',
      analysisId,
      contractId,
      provisionCount: provisions.length,
    });
  } catch (error) {
    console.error('Error starting analysis:', error);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

async function runAnalysisAsync(
  userId: string,
  contractId: string,
  analysisId: string,
  provisions: any[]
): Promise<void> {
  await runAnalysis({
    userId,
    contractId,
    analysisId,
    provisions,
  });
}

// Export function for auto-triggering from ingest route
export async function startAnalysis(contractId: string, userId: string): Promise<void> {
  // Get contract
  const contract = await getContract(contractId);
  if (!contract) {
    throw new Error(`Contract ${contractId} not found`);
  }

  if (contract.status !== 'embedded') {
    throw new Error(`Contract must be embedded before analysis. Current status: ${contract.status}`);
  }

  // Create analysis record
  const analysisId = uuidv4();
  const analysis: Analysis = {
    userId,
    contractId,
    startedAt: new Date(),
    model: 'gpt-4o-mini',
    status: 'running',
  };

  await createAnalysis(contractId, analysisId, analysis);

  // Start analysis in background
  const provisions = getProvisionCatalog();

  runAnalysisAsync(userId, contractId, analysisId, provisions)
    .then(() => console.log(`Analysis ${analysisId} completed`))
    .catch((error) =>
      console.error(`Analysis ${analysisId} failed:`, error)
    );
}

export default router;
