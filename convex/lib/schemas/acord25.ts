import { z } from "zod";

// ── Evidence ────────────────────────────────────────────────────────
// Shared structure: ties an extracted value back to the source document.

export const evidenceSchema = z.object({
  field: z.string(),
  page: z.number().int(),
  excerpt: z.string(),
});

// ── Contract-level metadata ─────────────────────────────────────────

export const contractInfoSchema = z.object({
  projectName: z.string().nullable(),
  contractNumber: z.string().nullable(),
  parties: z.object({
    contractor: z.string().nullable(),
    requestor: z.string().nullable(),
  }),
  certDeadline: z.string().nullable(),
  notes: z.string().nullable(),
});

// ── General Liability ───────────────────────────────────────────────

export const generalLiabilitySchema = z.object({
  required: z.boolean(),
  formType: z.enum(["occurrence", "claimsMade"]).nullable(),
  addlInsured: z.boolean(),
  subrogationWaived: z.boolean(),
  genAggregateAppliesPer: z
    .enum(["policy", "project", "location"])
    .nullable(),
  limits: z.object({
    eachOccurrence: z.number().nullable(),
    generalAggregate: z.number().nullable(),
    productsCompletedOpsAggregate: z.number().nullable(),
    personalAdvertisingInjury: z.number().nullable(),
    damageToRentedPremises: z.number().nullable(),
    medicalExpense: z.number().nullable(),
  }),
  notes: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});

// ── Auto Liability ──────────────────────────────────────────────────

export const autoLiabilitySchema = z.object({
  required: z.boolean(),
  addlInsured: z.boolean(),
  subrogationWaived: z.boolean(),
  coverageSymbols: z.object({
    anyAuto: z.boolean(),
    ownedAutosOnly: z.boolean(),
    scheduledAutos: z.boolean(),
    hiredAutosOnly: z.boolean(),
    nonOwnedAutosOnly: z.boolean(),
  }),
  limits: z.object({
    combinedSingleLimit: z.number().nullable(),
    bodilyInjuryPerPerson: z.number().nullable(),
    bodilyInjuryPerAccident: z.number().nullable(),
    propertyDamagePerAccident: z.number().nullable(),
  }),
  notes: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});

// ── Umbrella / Excess ───────────────────────────────────────────────

export const umbrellaExcessSchema = z.object({
  required: z.boolean(),
  type: z.enum(["umbrella", "excess"]).nullable(),
  formType: z.enum(["occurrence", "claimsMade"]).nullable(),
  addlInsured: z.boolean(),
  subrogationWaived: z.boolean(),
  limits: z.object({
    eachOccurrence: z.number().nullable(),
    aggregate: z.number().nullable(),
  }),
  notes: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});

// ── Workers Compensation ────────────────────────────────────────────

export const workersCompSchema = z.object({
  required: z.boolean(),
  wcStatutory: z.boolean(),
  subrogationWaived: z.boolean(),
  employersLiability: z.object({
    eachAccident: z.number().nullable(),
    diseasePolicyLimit: z.number().nullable(),
    diseaseEachEmployee: z.number().nullable(),
  }),
  notes: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});

// ── Other coverages (Professional, Cyber, Pollution, etc.) ─────────

export const otherCoverageSchema = z.object({
  coverageName: z.string(),
  required: z.boolean(),
  formType: z
    .enum(["occurrence", "claimsMade", "notApplicable"])
    .nullable(),
  addlInsured: z.boolean(),
  subrogationWaived: z.boolean(),
  limits: z.array(
    z.object({
      label: z.string(),
      amount: z.number().nullable(),
    })
  ),
  notes: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});

// ── Insurers affording coverage ─────────────────────────────────────
// Models the ACORD-25 "INSURERS AFFORDING COVERAGE" A–F table. Only the
// COI (actual) side populates this; the requirements side returns [].

export const insurerSchema = z.object({
  letter: z.string().nullable(),
  name: z.string(),
  naic: z.string().nullable(),
});

// ── Address ─────────────────────────────────────────────────────────

export const addressSchema = z.object({
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
});

// ── Certificate Holder ──────────────────────────────────────────────

export const certificateHolderSchema = z.object({
  name: z.string().nullable(),
  address: addressSchema,
});

// ── Named Insured ───────────────────────────────────────────────────

export const namedInsuredSchema = z.object({
  name: z.string().nullable(),
  address: addressSchema,
});

// ── Description of Operations ───────────────────────────────────────

export const descriptionOfOperationsSchema = z.object({
  text: z.string().nullable(),
  structured: z.object({
    projectName: z.string().nullable(),
    jobNumber: z.string().nullable(),
    locations: z.array(addressSchema),
    additionalInsured: z.object({
      isRequiredByContract: z.boolean(),
      scope: z.enum([
        "ongoingOperations",
        "completedOperations",
        "both",
        "unspecified",
      ]),
      notes: z.string().nullable(),
    }),
    waiverOfSubrogation: z.boolean(),
    primaryNoncontributory: z.boolean(),
    perProjectAggregate: z.boolean(),
  }),
});

// ── Cancellation ────────────────────────────────────────────────────

export const cancellationSchema = z.object({
  noticeDays: z.number().nullable(),
  notes: z.string().nullable(),
});

// ── Special requirement ─────────────────────────────────────────────

export const specialRequirementSchema = z.object({
  requirement: z.string(),
  page: z.number().int(),
  excerpt: z.string(),
});

// ── Composite: extractContractInfo tool output ──────────────────────
// Groups the sections that the contractInfo sub-agent returns together.

export const contractInfoExtractionSchema = z.object({
  contractInfo: contractInfoSchema,
  namedInsured: namedInsuredSchema,
  certificateHolder: certificateHolderSchema,
  descriptionOfOperations: descriptionOfOperationsSchema,
  cancellation: cancellationSchema,
  specialRequirements: z.array(specialRequirementSchema),
});

// ── Full ACORD 25 Requirements ──────────────────────────────────────

export const acord25RequirementsSchema = z.object({
  contractInfo: contractInfoSchema,
  coverages: z.object({
    generalLiability: generalLiabilitySchema,
    autoLiability: autoLiabilitySchema,
    umbrellaExcess: umbrellaExcessSchema,
    workersComp: workersCompSchema,
    other: z.array(otherCoverageSchema),
  }),
  descriptionOfOperations: descriptionOfOperationsSchema,
  namedInsured: namedInsuredSchema.nullable(),
  certificateHolder: certificateHolderSchema,
  cancellation: cancellationSchema,
  specialRequirements: z.array(specialRequirementSchema),
  insurers: z.array(insurerSchema),
});

// ── TypeScript types ────────────────────────────────────────────────

export type Evidence = z.infer<typeof evidenceSchema>;
export type Insurer = z.infer<typeof insurerSchema>;
export type ContractInfo = z.infer<typeof contractInfoSchema>;
export type GeneralLiability = z.infer<typeof generalLiabilitySchema>;
export type AutoLiability = z.infer<typeof autoLiabilitySchema>;
export type UmbrellaExcess = z.infer<typeof umbrellaExcessSchema>;
export type WorkersComp = z.infer<typeof workersCompSchema>;
export type OtherCoverage = z.infer<typeof otherCoverageSchema>;
export type CertificateHolder = z.infer<typeof certificateHolderSchema>;
export type NamedInsured = z.infer<typeof namedInsuredSchema>;
export type DescriptionOfOperations = z.infer<
  typeof descriptionOfOperationsSchema
>;
export type Cancellation = z.infer<typeof cancellationSchema>;
export type SpecialRequirement = z.infer<typeof specialRequirementSchema>;
export type ContractInfoExtraction = z.infer<
  typeof contractInfoExtractionSchema
>;
export type Acord25Requirements = z.infer<typeof acord25RequirementsSchema>;

type CertificateHolderSource = {
  certificateHolder?: {
    name?: string | null;
    address?: Partial<CertificateHolder["address"]> | null;
  } | null;
  contractInfo?: {
    parties?: {
      contractor?: string | null;
      requestor?: string | null;
    } | null;
  } | null;
};

type NamedInsuredSource = {
  namedInsured?: {
    name?: string | null;
    address?: Partial<NamedInsured["address"]> | null;
  } | null;
  contractInfo?: {
    parties?: {
      contractor?: string | null;
    } | null;
  } | null;
};

const EMPTY_ADDRESS: NamedInsured["address"] = {
  line1: "",
  line2: null,
  city: "",
  state: "",
  postalCode: "",
};

const GENERIC_HOLDER_NAMES = new Set([
  "owner",
  "client",
  "customer",
  "developer",
  "construction manager",
  "contracting authority",
  "indemnitee",
  "certificate holder",
  "project owner",
  "owner's designee",
  "owner designee",
  "designated representative",
]);

function cleanNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEntityName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(the|inc|incorporated|llc|ltd|co|company|corp|corporation)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCertificateHolder(
  source: CertificateHolderSource
): CertificateHolder {
  const holder = source.certificateHolder ?? {};
  const holderName = cleanNullableString(holder.name);
  const contractorName = cleanNullableString(
    source.contractInfo?.parties?.contractor
  );
  const requestorName = cleanNullableString(
    source.contractInfo?.parties?.requestor
  );

  const normalizedHolder = normalizeEntityName(holderName);
  const normalizedContractor = normalizeEntityName(contractorName);
  const shouldUseRequestor =
    !!requestorName &&
    (!holderName ||
      GENERIC_HOLDER_NAMES.has(normalizedHolder) ||
      (!!normalizedContractor && normalizedHolder === normalizedContractor));

  return {
    name: shouldUseRequestor ? requestorName : holderName,
    address: normalizeAddress(holder.address),
  };
}

function normalizeAddress(
  address: Partial<NamedInsured["address"]> | null | undefined
): NamedInsured["address"] {
  return {
    ...EMPTY_ADDRESS,
    line1: typeof address?.line1 === "string" ? address.line1 : "",
    line2: typeof address?.line2 === "string" ? address.line2 : null,
    city: typeof address?.city === "string" ? address.city : "",
    state: typeof address?.state === "string" ? address.state : "",
    postalCode:
      typeof address?.postalCode === "string" ? address.postalCode : "",
  };
}

export function resolveNamedInsured(source: NamedInsuredSource): NamedInsured {
  const insured = source.namedInsured ?? {};
  const insuredName = cleanNullableString(insured.name);
  const contractorName = cleanNullableString(
    source.contractInfo?.parties?.contractor
  );

  return {
    name: insuredName ?? contractorName,
    address: normalizeAddress(insured.address),
  };
}
