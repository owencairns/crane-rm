import provisionCatalog from "../data/provisions.json";
import type { FindingRecord, Provision, ProviderType } from "./types";
import { analysisConfig } from "./analysisConfig";

const PROVISION_CATALOG = provisionCatalog as Provision[];

export function getProvisionCatalog(): Provision[] {
  return PROVISION_CATALOG;
}

export function getProvisionCatalogVersion(): string {
  return analysisConfig.catalogVersion;
}

export function getProvisionById(provisionId: string): Provision | undefined {
  return PROVISION_CATALOG.find((provision) => provision.provisionId === provisionId);
}

/* ------------------------------------------------------------------ */
/*  "Subcontractor" label provision                                   */
/*                                                                    */
/*  Per Red Cedar (Chris): only crane companies should ask to be      */
/*  called "Service Provider", and only scaffold companies should ask */
/*  to be called "Equipment Provider". Every other trade is properly  */
/*  a "Subcontractor", so the provision never flags for them.         */
/* ------------------------------------------------------------------ */

export const PROVIDER_LABEL_PROVISION_ID = "subcontractor-vs-service-provider";

const PROVIDER_LABELS: Record<Exclude<ProviderType, "other">, string> = {
  crane: "Service Provider",
  scaffold: "Equipment Provider",
};

const PROVIDER_TRADE_NAMES: Record<Exclude<ProviderType, "other">, string> = {
  crane: "crane companies",
  scaffold: "scaffold companies",
};

function isLabeledProvider(
  providerType: ProviderType | undefined
): providerType is Exclude<ProviderType, "other"> {
  return providerType === "crane" || providerType === "scaffold";
}

/**
 * Enforces the trade rule on a freshly recorded finding: the label provision
 * can only be matched for crane or scaffold companies.
 */
export function applyProviderLabelRule<
  T extends Pick<FindingRecord, "provisionId" | "matched" | "reasoningSummary" | "providerType">,
>(finding: T): T {
  if (finding.provisionId !== PROVIDER_LABEL_PROVISION_ID) return finding;
  if (!finding.matched || isLabeledProvider(finding.providerType)) return finding;

  return {
    ...finding,
    matched: false,
    providerType: finding.providerType ?? "other",
    reasoningSummary: `Not applicable: only crane companies (Service Provider) and scaffold companies (Equipment Provider) should ask to change the "Subcontractor" label. ${finding.reasoningSummary}`,
  };
}

/** Title and suggested action shown for a finding, specialized by trade where relevant. */
export function getFindingPresentation(
  provision: Provision | undefined,
  finding: Pick<FindingRecord, "provisionId" | "providerType">
): { title?: string; suggestedAction?: string } {
  if (finding.provisionId === PROVIDER_LABEL_PROVISION_ID && isLabeledProvider(finding.providerType)) {
    const label = PROVIDER_LABELS[finding.providerType];
    return {
      title: `"Subcontractor" should be "${label}"`,
      suggestedAction: `Request that 'Subcontractor' be changed to '${label}'. ${PROVIDER_TRADE_NAMES[finding.providerType][0].toUpperCase()}${PROVIDER_TRADE_NAMES[finding.providerType].slice(1)} are ${label.toLowerCase()}s, not subcontractors, and the label pulls in construction obligations that don't fit that role.`,
    };
  }
  return {
    title: provision?.canonicalWording,
    suggestedAction: provision?.suggestedAction,
  };
}
