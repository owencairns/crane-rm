import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getContract,
  getAnalysis,
  getFindings,
  getLatestAnalysis,
  verifyContractOwnership,
} from '../services/firebase.service';
import { getProvisionById } from '../services/provision.service';

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

    // Group findings by priority for summary
    const matchedCount = findings.filter(f => f.matched).length;
    const notFoundCount = findings.filter(f => !f.matched).length;

    res.json({
      contractId,
      jobId: analysisId,
      status: analysis.status || 'completed',
      summary: `Analysis complete: ${matchedCount} provisions found, ${notFoundCount} not found.`,
      findings: findings.map(finding => {
        const provision = getProvisionById(finding.provisionId);
        return {
          id: finding.provisionId,
          priority: finding.priority, // 'critical' | 'high' | 'medium' | 'low'
          matched: finding.matched, // true = found in contract, false = not found
          confidence: finding.confidence,
          category: finding.priority, // Group by priority
          title: provision?.canonicalWording || finding.provisionId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: finding.reasoningSummary,
          pageReferences: finding.evidencePages,
          evidenceExcerpts: finding.evidenceExcerpts,
          recommendation: finding.recommendedAction,
          suggestedAction: finding.matched ? provision?.suggestedAction : undefined,
          screeningResult: finding.screeningResult, // 'no_candidates' | 'analyzed_not_found' | 'analyzed_found' | 'not_analyzed' | 'error'
        };
      }),
      riskScore,
      completedAt: analysis.completedAt,
      error: analysis.error,
    });
  } catch (error) {
    console.error('Error fetching contract results:', error);
    res.status(500).json({ error: 'Failed to fetch contract results' });
  }
});

// Helper function to calculate risk score based on NOT FOUND provisions
function calculateRiskScore(findings: any[]): number {
  if (findings.length === 0) return 0;

  // Risk is based on provisions that were NOT found in the contract
  const notFoundFindings = findings.filter(f => !f.matched);

  if (notFoundFindings.length === 0) return 0; // All provisions found = no risk

  const severityWeights: Record<string, number> = {
    critical: 30, // Missing critical provisions are very risky
    high: 20,
    medium: 10,
    low: 5,
  };

  const totalScore = notFoundFindings.reduce((sum, finding) => {
    return sum + (severityWeights[finding.priority] || 0);
  }, 0);

  // Cap at 100
  return Math.min(100, totalScore);
}

export default router;
