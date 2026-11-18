import { resolveCertificateHolder } from "../schemas/acord25";
import type { CertRequirements, CoverageLine } from "./schema";

/*
 * Description of Operations wording.
 *
 * Sentences come from Red Cedar's Certificate Issuance Guidelines and follow
 * the shape of certificates Red Cedar actually issues ("X, Y and Z are
 * Additional Insured on the above ... as required by written contract").
 * Only the slots (party names, policy labels, project) are filled from the
 * contract. Never copy free text from the contract into these sentences.
 */

// Policy labels from the guidelines. Keep these exact.
const LABEL: Record<CoverageLine, string> = {
  generalLiability: "General Liability",
  autoLiability: "Automobile Liability",
  umbrellaExcess: "Umbrella Liability",
  workersComp: "Workers Compensation",
};
const LABEL_EL = "Employers Liability";

function umbrellaLabel(req: CertRequirements): string {
  return req.coverages.umbrellaExcess.type === "excess"
    ? "Excess Liability"
    : "Umbrella Liability";
}

function lineLabel(req: CertRequirements, line: CoverageLine): string {
  return line === "umbrellaExcess" ? umbrellaLabel(req) : LABEL[line];
}

export function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|inc|incorporated|llc|ltd|co|company|corp|corporation)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function linesWhere(
  req: CertRequirements,
  pick: (line: CoverageLine) => boolean,
): CoverageLine[] {
  const order: CoverageLine[] = [
    "generalLiability",
    "autoLiability",
    "umbrellaExcess",
    "workersComp",
  ];
  return order.filter((line) => req.coverages[line].required && pick(line));
}

function aiLines(req: CertRequirements): string[] {
  const c = req.coverages;
  const labels = linesWhere(
    req,
    (line) => line !== "workersComp" && c[line].addlInsured,
  ).map((line) => lineLabel(req, line));
  // Property-type lines (floaters, builder's risk) take a loss payee, not an
  // additional insured.
  const first = formOtherCoverage(req);
  if (first?.addlInsured && !isPropertyCoverage(first.coverageName)) labels.push(first.coverageName);
  return labels;
}

export function isPropertyCoverage(name: string): boolean {
  return /floater|builder'?s'? risk|property|inland marine|installation|equipment/i.test(name);
}

/**
 * The single OTHER row on the ACORD 25: the first required other coverage
 * with a stated limit, else the first required one.
 */
export function formOtherCoverage(req: CertRequirements) {
  const others = req.coverages.other.filter((o) => o.required);
  return others.find((o) => o.limits.some((l) => l.amount !== null)) ?? others[0] ?? null;
}

function wosLines(req: CertRequirements): string[] {
  const c = req.coverages;
  const labels = linesWhere(req, (line) => c[line].subrogationWaived).map(
    (line) => lineLabel(req, line),
  );
  const first = formOtherCoverage(req);
  if (first?.subrogationWaived) labels.push(first.coverageName);
  return labels;
}

function pncLines(req: CertRequirements): string[] {
  const stated = req.endorsements.primaryNoncontributoryLines.filter(
    (line) => req.coverages[line].required && line !== "workersComp",
  );
  if (stated.length > 0) return stated.map((line) => lineLabel(req, line));
  if (!req.descriptionOfOperations.structured.primaryNoncontributory) return [];
  // PNC with no line named: it rides on GL, or on the AI lines without GL.
  if (req.coverages.generalLiability.required) return [LABEL.generalLiability];
  return aiLines(req);
}

function requiresPnc(req: CertRequirements): boolean {
  return (
    req.descriptionOfOperations.structured.primaryNoncontributory ||
    req.endorsements.primaryNoncontributoryLines.length > 0
  );
}

/** Holder first, then every other party the contract names, de-duplicated. */
export function protectedParties(req: CertRequirements): string[] {
  const holder = resolveCertificateHolder(req).name?.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  // "its officers, directors and employees" belongs to the holder, so it
  // goes right after the holder's name. "<Holder>'s officers ..." is
  // rewritten to the same form.
  const holderKey = holder ? normalizeName(holder) : "";
  const listed = req.endorsements.additionalInsuredParties.map((p) => {
    const m = p.match(/^(.*?)['\u2019]s\s+(.+)$/);
    if (m && holderKey && normalizeName(m[1]) === holderKey) return `its ${m[2]}`;
    return p;
  });
  const own = listed.filter((p) => /^\s*its\b/i.test(p));
  const rest = listed.filter((p) => !/^\s*its\b/i.test(p));
  for (const name of [holder, ...own, ...rest]) {
    const clean = name?.trim().replace(/[;,]+$/, "").replace(/^and\s+/i, "");
    if (!clean) continue;
    const key = normalizeName(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function partyPhrase(req: CertRequirements): { text: string; plural: boolean } {
  const parties = protectedParties(req);
  if (parties.length === 0) return { text: "The certificate holder", plural: false };
  return { text: joinList(parties), plural: parties.length > 1 };
}

function projectLines(req: CertRequirements): string[] {
  const s = req.descriptionOfOperations.structured;
  const project = s.projectName?.trim() || req.contractInfo.projectName?.trim() || "";
  const job = s.jobNumber?.trim() || req.contractInfo.contractNumber?.trim() || "";
  const out: string[] = [];
  if (project && job) out.push(`Project: ${project}, Job # ${job}`);
  else if (project) out.push(`Project: ${project}`);
  else if (job) out.push(`Job # ${job}`);

  const loc = s.locations.find((l) => l.line1.trim() || l.city.trim());
  if (loc) {
    const cityLine = [loc.city, [loc.state, loc.postalCode].filter(Boolean).join(" ")]
      .filter((part) => part.trim())
      .join(", ");
    const address = [loc.line1, loc.line2, cityLine].filter((p) => p && p.trim()).join(", ");
    if (address) out.push(`Project Location: ${address}`);
  }
  return out;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** Other coverages that don't fit on the single OTHER row of the form. */
function overflowCoverageLines(req: CertRequirements): string[] {
  const onForm = formOtherCoverage(req);
  return req.coverages.other
    .filter((o) => o.required && o !== onForm)
    .flatMap((o) => {
      const limits = o.limits
        .filter((l) => l.amount !== null)
        .map((l) => `${l.label} ${formatMoney(l.amount as number)}`);
      return limits.length > 0 ? [`${o.coverageName}: ${limits.join("; ")}.`] : [];
    });
}

/**
 * Build the Description of Operations / Remarks text. This is the text an
 * agent pastes into the real certificate, so it carries no EXAMPLE notice.
 */
export function buildCertRemarks(req: CertRequirements): string {
  const lines = projectLines(req);
  const ai = aiLines(req);
  const wos = wosLines(req);
  const pnc = requiresPnc(req);
  const parties = partyPhrase(req);
  const extraParties = protectedParties(req).length > 1;
  const umbrella = req.coverages.umbrellaExcess;
  const overflow = overflowCoverageLines(req);

  // ── Plain cert templates (verbatim from the guidelines) ──
  if (ai.length === 0 && wos.length === 0 && !pnc) {
    lines.push("Verification of coverage only.");
    lines.push(...overflow);
    return lines.join("\n");
  }

  const holderOnly = !extraParties;
  if (
    holderOnly &&
    ai.length === 1 &&
    ai[0] === LABEL.generalLiability &&
    wos.length === 0 &&
    !pnc &&
    !umbrella.required &&
    req.descriptionOfOperations.structured.additionalInsured.scope !== "both" &&
    req.descriptionOfOperations.structured.additionalInsured.scope !== "completedOperations"
  ) {
    lines.push(
      `${parties.text} is Additional Insured on General Liability as required by written contract, for All Operations of the Named Insured.`,
    );
    lines.push(...overflow);
    return lines.join("\n");
  }

  if (holderOnly && ai.length === 0 && !pnc && wos.length === 1 && wos[0] === LABEL.workersComp) {
    lines.push(
      "A Waiver of Subrogation applies in favor of the certificate holder on the above workers compensation policy, as required by written contract.",
    );
    lines.push(...overflow);
    return lines.join("\n");
  }

  // ── Composed cert (approved phrases only) ──
  if (ai.length > 0) {
    lines.push(
      `${parties.text} ${parties.plural ? "are" : "is"} Additional Insured on the above ${joinList(ai)} as required by written contract.`,
    );
    const scope = req.descriptionOfOperations.structured.additionalInsured.scope;
    if (req.coverages.generalLiability.addlInsured && (scope === "both" || scope === "completedOperations")) {
      lines.push(
        scope === "both"
          ? "Additional Insured on General Liability includes ongoing and completed operations per the attached."
          : "Additional Insured on General Liability includes completed operations per the attached.",
      );
    }
  }

  if (pnc) {
    const pncLabels = pncLines(req);
    if (pncLabels.length > 0) {
      lines.push(`Primary and Non-contributory on ${joinList(pncLabels)} applies per the attached.`);
    }
  }

  if (wos.length > 0) {
    lines.push(
      `A Waiver of Subrogation applies in favor of ${parties.text} on the above ${joinList(wos)} as required by written contract.`,
    );
  }

  const gl = req.coverages.generalLiability;
  if (
    gl.required &&
    (gl.genAggregateAppliesPer === "project" ||
      req.descriptionOfOperations.structured.perProjectAggregate)
  ) {
    lines.push("General Liability aggregate applies per project per the attached.");
  }

  if (umbrella.required) {
    const underlying: string[] = [];
    if (gl.required) underlying.push(LABEL.generalLiability);
    if (req.coverages.autoLiability.required) underlying.push(LABEL.autoLiability);
    if (req.coverages.workersComp.required) underlying.push(LABEL_EL);
    if (underlying.length > 0) {
      lines.push(
        `The above ${umbrellaLabel(req)} policy follows form over the above ${joinList(underlying)} except where limited by policy provisions.`,
      );
    }
  }

  lines.push(...overflow);
  return lines.join("\n");
}
