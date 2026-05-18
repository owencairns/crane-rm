import provisionCatalog from "../data/provisions.json";
import type { Provision } from "./types";
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
