import type { Provision } from '../models/types';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

// Load provisions from JSON file
const provisionsPath = path.join(__dirname, '../data/provisions.json');
const PROVISION_CATALOG: Provision[] = JSON.parse(fs.readFileSync(provisionsPath, 'utf-8'));

export function getProvisionCatalog(): Provision[] {
  return PROVISION_CATALOG;
}

export function getProvisionCatalogVersion(): string {
  return config.catalogVersion;
}

export function getProvisionById(provisionId: string): Provision | undefined {
  return PROVISION_CATALOG.find((p) => p.provisionId === provisionId);
}

export function getProvisionsByPriority(priority: string): Provision[] {
  return PROVISION_CATALOG.filter((p) => p.priority === priority);
}

export function getProvisionsByCluster(clusterId: string): Provision[] {
  return PROVISION_CATALOG.filter((p) => p.clusterId === clusterId);
}

// Reload provisions from disk (useful for hot-reloading in development)
export function reloadProvisions(): void {
  const newProvisions = JSON.parse(fs.readFileSync(provisionsPath, 'utf-8'));
  PROVISION_CATALOG.length = 0;
  PROVISION_CATALOG.push(...newProvisions);
}
