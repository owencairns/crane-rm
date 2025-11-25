import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getContract,
  getAnalysis,
  getFindings,
  getLatestAnalysis,
  verifyContractOwnership,
} from '../services/firebase.service';

const router = Router();

// GET /results/:contractId/analyses/:analysisId - Get analysis results
router.get(
  '/:contractId/analyses/:analysisId',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { contractId, analysisId } = req.params;
      const userId = req.userId!;

      // Verify ownership
      const hasAccess = await verifyContractOwnership(contractId, userId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get analysis
      const analysis = await getAnalysis(contractId, analysisId);
      if (!analysis) {
        return res.status(404).json({ error: 'Analysis not found' });
      }

      // Get findings
      const findings = await getFindings(contractId, analysisId);

      res.json({
        analysis,
        findings,
        findingCount: findings.length,
      });
    } catch (error) {
      console.error('Error fetching results:', error);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  }
);

// GET /results/:contractId - Get latest analysis results for a contract
router.get('/:contractId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.userId!;

    // Verify ownership
    const hasAccess = await verifyContractOwnership(contractId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get contract
    const contract = await getContract(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Get latest analysis
    const latestAnalysis = await getLatestAnalysis(contractId);
    if (!latestAnalysis) {
      return res.status(404).json({
        error: 'No analysis found',
        message: 'This contract has not been analyzed yet'
      });
    }

    const { analysis, analysisId } = latestAnalysis;

    // Get findings
    const findings = await getFindings(contractId, analysisId);

    // Calculate risk score from findings
    const riskScore = calculateRiskScore(findings);

    res.json({
      contractId,
      jobId: analysisId,
      status: analysis.status || 'completed',
      summary: `Analysis complete with ${findings.length} findings.`,
      findings: findings.map(finding => ({
        id: finding.provisionId,
        severity: finding.priority, // 'critical' | 'high' | 'medium' | 'low'
        category: 'Provision Analysis',
        title: finding.provisionId,
        description: finding.reasoningSummary,
        pageReference: finding.evidencePages[0], // First page reference
        clauseText: finding.evidenceExcerpts[0], // First excerpt
        recommendation: finding.recommendedAction,
      })),
      riskScore,
      completedAt: analysis.completedAt,
    });
  } catch (error) {
    console.error('Error fetching contract results:', error);
    res.status(500).json({ error: 'Failed to fetch contract results' });
  }
});

// Helper function to calculate risk score
function calculateRiskScore(findings: any[]): number {
  if (findings.length === 0) return 0;

  const severityWeights: Record<string, number> = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
  };

  const totalScore = findings.reduce((sum, finding) => {
    return sum + (severityWeights[finding.priority] || 0);
  }, 0);

  // Cap at 100
  return Math.min(100, totalScore);
}

export default router;
