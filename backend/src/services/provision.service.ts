import type { Provision } from '../models/types';
import { config } from '../config';

// Provision catalog - stored server-side, versioned
// This is a sample catalog structure. You'll populate with your actual provisions.

const PROVISION_CATALOG: Provision[] = [
  // Critical provisions
  {
    provisionId: 'additional-insured',
    priority: 'critical',
    canonicalWording:
      'Subcontractor shall name Contractor as additional insured on all liability policies',
    synonyms: [
      'additional insured',
      'named as insured',
      'contractor added to policy',
      'include contractor on insurance',
    ],
    definition:
      'Requirement that the general contractor be added as an additional insured on the subcontractor insurance policies',
    falsePositiveTraps: [
      'Certificate holder only (not additional insured)',
      'Optional or conditional language',
      'Only for specific policies (must be all liability policies)',
    ],
    confidenceRubric: {
      explicit:
        'Contains phrase "additional insured" with clear requirement for contractor',
      strongParaphrase:
        'Clear requirement to add/name contractor to insurance policies',
      weak: 'Mentions insurance but additional insured status is unclear or conditional',
    },
  },
  {
    provisionId: 'primary-non-contributory',
    priority: 'critical',
    canonicalWording:
      "Subcontractor's insurance shall be primary and non-contributory",
    synonyms: [
      'primary and non-contributory',
      'primary coverage',
      'not contribute to',
      'insurance is primary',
    ],
    definition:
      'Requirement that subcontractor insurance pays first before contractor insurance',
    falsePositiveTraps: [
      'Only mentions "primary" without "non-contributory"',
      'Applies only to specific policy types',
      'Conditional language',
    ],
    confidenceRubric: {
      explicit: 'Contains both "primary" and "non-contributory" together',
      strongParaphrase:
        'Clear statement that subcontractor insurance pays first',
      weak: 'Mentions primary coverage but non-contributory status unclear',
    },
  },
  {
    provisionId: 'waiver-of-subrogation',
    priority: 'critical',
    canonicalWording:
      'Subcontractor waives all rights of subrogation against Contractor',
    synonyms: [
      'waiver of subrogation',
      'waive subrogation rights',
      'waive right of recovery',
      'no subrogation',
    ],
    definition:
      'Prevents insurer from suing contractor to recover claim payments',
    falsePositiveTraps: [
      'Only waives for specific incidents',
      'Conditional waiver',
      'Mentions subrogation without clear waiver',
    ],
    confidenceRubric: {
      explicit: 'Explicit "waiver of subrogation" language',
      strongParaphrase:
        'Clear statement that subcontractor/insurer cannot pursue contractor for recovery',
      weak: 'Mentions subrogation but waiver is conditional or unclear',
    },
  },

  // High priority provisions
  {
    provisionId: 'liquidated-damages',
    priority: 'high',
    canonicalWording: 'Liquidated damages for delay',
    synonyms: [
      'liquidated damages',
      'delay damages',
      'per diem damages',
      'daily damages for delay',
    ],
    definition:
      'Predetermined amount charged for each day of delay in completion',
    falsePositiveTraps: [
      'Actual damages (not liquidated)',
      'General damages clause',
      'No specific amount or rate',
    ],
    confidenceRubric: {
      explicit:
        'Contains "liquidated damages" with amount/rate per day of delay',
      strongParaphrase: 'Specific daily/weekly amount for delays',
      weak: 'Mentions damages for delay but amount/rate unclear',
    },
  },
  {
    provisionId: 'indemnity-clause',
    priority: 'high',
    canonicalWording:
      'Subcontractor shall indemnify and hold harmless Contractor',
    synonyms: [
      'indemnify',
      'hold harmless',
      'defend and indemnify',
      'indemnification',
    ],
    definition: 'Obligation to compensate contractor for losses/claims',
    falsePositiveTraps: [
      'Mutual indemnity (both parties)',
      'Limited to specific circumstances only',
      'Comparative negligence language that limits scope',
    ],
    confidenceRubric: {
      explicit:
        'Clear indemnity obligation with "indemnify" and "hold harmless"',
      strongParaphrase:
        'Clear obligation to protect contractor from claims/losses',
      weak: 'Indemnity mentioned but scope unclear or heavily limited',
    },
  },

  // Medium priority provisions
  {
    provisionId: 'notice-of-claim',
    priority: 'medium',
    canonicalWording:
      'Subcontractor must provide immediate notice of any claims or incidents',
    synonyms: [
      'notice of claim',
      'immediate notification',
      'report incidents',
      'prompt notice',
    ],
    definition: 'Requirement to notify contractor of claims/incidents quickly',
    falsePositiveTraps: [
      'General notice requirements (not claim-specific)',
      'No timeframe specified',
      'Notice to insurance company only',
    ],
    confidenceRubric: {
      explicit:
        'Specific claim/incident notice requirement with timeframe (immediate, 24hrs, etc)',
      strongParaphrase: 'Clear obligation to notify contractor of claims quickly',
      weak: 'General notice provisions without claim focus',
    },
  },

  // Low priority provisions
  {
    provisionId: 'certificate-of-insurance',
    priority: 'low',
    canonicalWording:
      'Subcontractor shall provide certificates of insurance before work begins',
    synonyms: [
      'certificate of insurance',
      'COI',
      'proof of insurance',
      'insurance certificates',
    ],
    definition: 'Requirement to provide insurance documentation',
    falsePositiveTraps: [
      'Mentions insurance without certificate requirement',
      'No timing specified',
      'Optional language',
    ],
    confidenceRubric: {
      explicit:
        'Explicit requirement for certificate of insurance with timing',
      strongParaphrase:
        'Clear requirement to provide insurance documentation before work',
      weak: 'Mentions insurance documentation but requirement unclear',
    },
  },
];

export function getProvisionCatalog(): Provision[] {
  return PROVISION_CATALOG;
}

export function getProvisionCatalogVersion(): string {
  return config.catalogVersion;
}

export function getProvisionById(provisionId: string): Provision | undefined {
  return PROVISION_CATALOG.find((p) => p.provisionId === provisionId);
}
