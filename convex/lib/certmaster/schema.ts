import { z } from "zod";
import {
  autoLiabilitySchema,
  cancellationSchema,
  certificateHolderSchema,
  contractInfoSchema,
  descriptionOfOperationsSchema,
  generalLiabilitySchema,
  namedInsuredSchema,
  otherCoverageSchema,
  specialRequirementSchema,
  umbrellaExcessSchema,
  workersCompSchema,
} from "../schemas/acord25";

/*
 * CertMaster reads a contract (or insurance exhibit) and produces an EXAMPLE
 * ACORD 25 showing the minimum coverage the contract demands. The coverage
 * sub-schemas are shared with SubProtect; CertMaster adds an `endorsements`
 * block for the parts of the remarks wording the shared schema can't express
 * (who else is additional insured, which lines are primary/non-contributory,
 * which endorsement forms the contract names).
 *
 * Extraction runs as two parallel structured calls, one per half below.
 */

export const coverageLineEnum = z.enum([
  "generalLiability",
  "autoLiability",
  "umbrellaExcess",
  "workersComp",
]);
export type CoverageLine = z.infer<typeof coverageLineEnum>;

export const endorsementRequirementsSchema = z.object({
  additionalInsuredParties: z
    .array(z.string())
    .describe(
      "Every party or role the contract says must be ADDITIONAL INSURED, as written (e.g. 'Owner', 'Architect', 'their officers, agents and employees'). Do not include the certificate holder unless the contract lists it again by name.",
    ),
  primaryNoncontributoryLines: z
    .array(coverageLineEnum)
    .describe(
      "Coverage lines the contract says must be primary and non-contributory. Empty when the contract does not require it.",
    ),
  additionalInsuredForms: z
    .array(z.string())
    .describe(
      "Endorsement form numbers the contract names for additional insured status, verbatim (e.g. 'CG 20 10 04 13', 'CG 20 37', 'CA 20 48').",
    ),
  otherRequiredForms: z
    .array(z.string())
    .describe(
      "Any other endorsement form numbers the contract names (waiver of subrogation, primary wording, notice of cancellation), verbatim.",
    ),
  completedOperationsYears: z
    .number()
    .nullable()
    .describe(
      "Years after completion that completed-operations coverage must be kept, when stated.",
    ),
});

export const conditionalRequirementSchema = z.object({
  trigger: z
    .string()
    .describe("The condition, e.g. 'if Subcontractor provides crane services'."),
  requirement: z
    .string()
    .describe("What is required when it applies, with limits, e.g. 'CGL $10,000,000 each occurrence and aggregate, rigger's liability'."),
  appliesToThisWork: z
    .enum(["yes", "no", "unclear"])
    .describe("Whether the scope of work in this document triggers it."),
  reason: z.string().describe("One sentence citing the scope that decides it."),
  page: z.number().int(),
  excerpt: z.string(),
});

export const coverageExtractionSchema = z.object({
  generalLiability: generalLiabilitySchema,
  autoLiability: autoLiabilitySchema,
  umbrellaExcess: umbrellaExcessSchema,
  workersComp: workersCompSchema,
  other: z.array(otherCoverageSchema),
  conditionalRequirements: z.array(conditionalRequirementSchema),
});

export const partiesExtractionSchema = z.object({
  contractInfo: contractInfoSchema,
  namedInsured: namedInsuredSchema,
  certificateHolder: certificateHolderSchema,
  descriptionOfOperations: descriptionOfOperationsSchema,
  cancellation: cancellationSchema,
  specialRequirements: z.array(specialRequirementSchema),
  endorsements: endorsementRequirementsSchema,
});

export type CoverageExtraction = z.infer<typeof coverageExtractionSchema>;
export type PartiesExtraction = z.infer<typeof partiesExtractionSchema>;
export type ConditionalRequirement = z.infer<typeof conditionalRequirementSchema>;
export type EndorsementRequirements = z.infer<
  typeof endorsementRequirementsSchema
>;

/** The assembled requirements a cert is generated from. */
export const certRequirementsSchema = z.object({
  contractInfo: contractInfoSchema,
  coverages: coverageExtractionSchema,
  descriptionOfOperations: descriptionOfOperationsSchema,
  namedInsured: namedInsuredSchema,
  certificateHolder: certificateHolderSchema,
  cancellation: cancellationSchema,
  specialRequirements: z.array(specialRequirementSchema),
  endorsements: endorsementRequirementsSchema,
});
export type CertRequirements = z.infer<typeof certRequirementsSchema>;

/** Agent-facing check raised after extraction. */
export type CertCheck = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
};

/** Evidence row with a flag saying whether the excerpt was found on its page. */
export type VerifiedEvidence = {
  section: string;
  field: string;
  page: number;
  excerpt: string;
  verified: boolean;
};

/**
 * Fields the agent can correct before regenerating the PDF. Everything else
 * comes from the contract.
 */
export const certEditsSchema = z.object({
  namedInsuredName: z.string().nullable(),
  namedInsuredAddress: z.string().nullable(),
  certificateHolderName: z.string().nullable(),
  certificateHolderAddress: z.string().nullable(),
  projectName: z.string().nullable(),
  jobNumber: z.string().nullable(),
});
export type CertEdits = z.infer<typeof certEditsSchema>;
