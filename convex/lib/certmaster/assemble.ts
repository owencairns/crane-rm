import { resolveCertificateHolder, resolveNamedInsured } from "../schemas/acord25";
import { formOtherCoverage } from "./remarks";
import type {
  CertCheck,
  CertEdits,
  CertRequirements,
  CoverageExtraction,
  PartiesExtraction,
  VerifiedEvidence,
} from "./schema";

/* ------------------------------------------------------------------ */
/*  Assembly                                                          */
/* ------------------------------------------------------------------ */

export function assembleRequirements(
  coverages: CoverageExtraction,
  parties: PartiesExtraction,
): CertRequirements {
  const req: CertRequirements = {
    contractInfo: parties.contractInfo,
    coverages,
    descriptionOfOperations: parties.descriptionOfOperations,
    namedInsured: parties.namedInsured,
    certificateHolder: parties.certificateHolder,
    cancellation: parties.cancellation,
    specialRequirements: parties.specialRequirements,
    endorsements: parties.endorsements,
  };

  // Resolve role names ("Owner") and fall back to the contract parties. A
  // bare role or placeholder is not a name.
  if (isPlaceholderName(req.namedInsured.name)) req.namedInsured.name = null;
  if (isPlaceholderName(req.contractInfo.parties.contractor)) req.contractInfo.parties.contractor = null;
  req.namedInsured = resolveNamedInsured(req);
  req.certificateHolder = resolveCertificateHolder(req);

  // Per-project aggregate can be stated in either half; keep them in sync.
  const s = req.descriptionOfOperations.structured;
  const gl = req.coverages.generalLiability;
  if (gl.required && !gl.genAggregateAppliesPer && s.perProjectAggregate) {
    gl.genAggregateAppliesPer = "project";
  }
  if (gl.genAggregateAppliesPer === "project") s.perProjectAggregate = true;

  // Umbrella with one figure: aggregate equals each occurrence.
  const ux = req.coverages.umbrellaExcess;
  if (ux.required && ux.limits.aggregate === null && ux.limits.eachOccurrence !== null) {
    ux.limits.aggregate = ux.limits.eachOccurrence;
  }

  // Additional insured stated in the description but no AI parties listed:
  // the holder alone is the AI party (handled by the remarks builder).
  s.additionalInsured.isRequiredByContract =
    s.additionalInsured.isRequiredByContract ||
    gl.addlInsured ||
    req.coverages.autoLiability.addlInsured ||
    ux.addlInsured;

  return req;
}

const PLACEHOLDER_NAME =
  /^\(?\s*(the\s+)?(sub-?contractor|sub-?sub-?contractor|contractor|vendor|consultant|supplier|trade contractor|your company|insured|named insured|company name)\s*\)?$/i;

function isPlaceholderName(name: string | null | undefined): boolean {
  return !!name && PLACEHOLDER_NAME.test(name.trim());
}

/* ------------------------------------------------------------------ */
/*  Agent edits                                                       */
/* ------------------------------------------------------------------ */

/** Parse "123 Main St, Suite 4, San Jose, CA 95112" into address parts. */
export function parseAddress(raw: string | null): CertRequirements["namedInsured"]["address"] {
  const empty = { line1: "", line2: null, city: "", state: "", postalCode: "" };
  if (!raw || !raw.trim()) return empty;
  const parts = raw
    .split(/\n|,/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return empty;
  const last = parts[parts.length - 1];
  const stateZip = last.match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (stateZip && parts.length >= 3) {
    return {
      line1: parts[0],
      line2: parts.length > 3 ? parts.slice(1, -2).join(", ") : null,
      city: parts[parts.length - 2],
      state: stateZip[1].toUpperCase(),
      postalCode: stateZip[2] ?? "",
    };
  }
  const cityStateZip = last.match(/^(.*?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (cityStateZip && parts.length >= 2) {
    return {
      line1: parts[0],
      line2: parts.length > 2 ? parts.slice(1, -1).join(", ") : null,
      city: cityStateZip[1],
      state: cityStateZip[2].toUpperCase(),
      postalCode: cityStateZip[3],
    };
  }
  return { ...empty, line1: parts[0], line2: parts.slice(1).join(", ") || null };
}

export function formatAddress(a: CertRequirements["namedInsured"]["address"]): string {
  const cityLine = [a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .filter((p) => p && p.trim())
    .join(", ");
  return [a.line1, a.line2, cityLine].filter((p) => p && p.trim()).join(", ");
}

export function editsFromRequirements(req: CertRequirements): CertEdits {
  return {
    namedInsuredName: req.namedInsured.name,
    namedInsuredAddress: formatAddress(req.namedInsured.address) || null,
    certificateHolderName: req.certificateHolder.name,
    certificateHolderAddress: formatAddress(req.certificateHolder.address) || null,
    projectName:
      req.descriptionOfOperations.structured.projectName ?? req.contractInfo.projectName,
    jobNumber:
      req.descriptionOfOperations.structured.jobNumber ?? req.contractInfo.contractNumber,
  };
}

export function applyEdits(req: CertRequirements, edits: CertEdits): CertRequirements {
  const next: CertRequirements = structuredClone(req);
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
  next.namedInsured = {
    name: clean(edits.namedInsuredName),
    address: parseAddress(edits.namedInsuredAddress),
  };
  next.certificateHolder = {
    name: clean(edits.certificateHolderName),
    address: parseAddress(edits.certificateHolderAddress),
  };
  next.descriptionOfOperations.structured.projectName = clean(edits.projectName);
  next.descriptionOfOperations.structured.jobNumber = clean(edits.jobNumber);
  next.contractInfo.projectName = clean(edits.projectName);
  return next;
}

/* ------------------------------------------------------------------ */
/*  Evidence verification                                             */
/* ------------------------------------------------------------------ */

function normalizeForMatch(text: string): string {
  // OCR markdown wraps words in **bold**, <u>tags</u> and table pipes, which
  // shifts punctuation ("Insurance**, on" vs "Insurance, on"). Compare words
  // only.
  return text
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check each evidence excerpt against the OCR text of the page it cites
 * (allowing one page either side, since OCR page splits can drift). Long
 * excerpts pass when 85% of their words appear in order-insensitive form.
 */
export function verifyEvidence(
  req: CertRequirements,
  pages: Array<{ pageNumber: number; markdown: string }>,
): VerifiedEvidence[] {
  const byPage = new Map(pages.map((p) => [p.pageNumber, normalizeForMatch(p.markdown)]));
  const rows: Array<{ section: string; field: string; page: number; excerpt: string }> = [];
  const c = req.coverages;
  const push = (section: string, list: Array<{ field: string; page: number; excerpt: string }>) =>
    list.forEach((e) => rows.push({ section, ...e }));
  push("General Liability", c.generalLiability.evidence);
  push("Automobile Liability", c.autoLiability.evidence);
  push("Umbrella / Excess", c.umbrellaExcess.evidence);
  push("Workers Compensation", c.workersComp.evidence);
  c.other.forEach((o) => push(o.coverageName, o.evidence));
  req.specialRequirements.forEach((s) =>
    rows.push({ section: "Special requirements", field: s.requirement, page: s.page, excerpt: s.excerpt }),
  );

  return rows.map((row) => {
    const needle = normalizeForMatch(row.excerpt);
    const candidates = [row.page, row.page - 1, row.page + 1]
      .map((n) => byPage.get(n))
      .filter((t): t is string => !!t);
    let verified = candidates.some((hay) => hay.includes(needle));
    if (!verified && needle.length > 0) {
      const words = needle.split(" ").filter((w) => w.length > 1);
      verified = candidates.some((hay) => {
        const hits = words.filter((w) => hay.includes(w)).length;
        return words.length > 0 && hits / words.length >= 0.85;
      });
    }
    return { ...row, verified };
  });
}

/* ------------------------------------------------------------------ */
/*  Agent checks                                                      */
/* ------------------------------------------------------------------ */

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export type DocumentSignals = { looksLikeIssuedCoi: boolean };

/**
 * An issued ACORD 25 (policy numbers, real carriers) rather than a contract
 * or a requestor's sample. CertMaster would read the client's current
 * coverage as if it were a requirement.
 */
export function detectDocumentSignals(text: string): DocumentSignals {
  const acordFace =
    /CERTIFICATE OF LIABILITY INSURANCE/i.test(text) && /INSURER\S* AFFORDING COVERAGE/i.test(text);
  const sample = /\bsample\b|\bspecimen\b|\(your (agent|company)\)|\bexample only\b/i.test(text);
  // Issued certs carry a certificate number and real NAIC codes.
  const issued =
    /CERTIFICATE NUMBER:?\s*\**\s*[A-Z0-9-]{5,}/i.test(text) || (text.match(/\b\d{5}\b/g) ?? []).length >= 3;
  return { looksLikeIssuedCoi: acordFace && issued && !sample };
}

export function buildChecks(
  req: CertRequirements,
  evidence: VerifiedEvidence[],
  signals: DocumentSignals = { looksLikeIssuedCoi: false },
): CertCheck[] {
  const checks: CertCheck[] = [];
  const add = (id: string, severity: CertCheck["severity"], title: string, detail: string) =>
    checks.push({ id, severity, title, detail });
  const c = req.coverages;

  if (signals.looksLikeIssuedCoi) {
    add(
      "input.issuedCoi",
      "error",
      "This looks like an issued certificate, not a contract",
      "The upload reads like an ACORD 25 that was already issued, so the limits here are the client's current coverage, not what a contract requires. Upload the contract or insurance exhibit instead, or use SubProtect to check this certificate against one.",
    );
  }

  if (!req.certificateHolder.name) {
    add(
      "holder.missing",
      "error",
      "No certificate holder found",
      "The contract does not say who the certificate goes to. Add the holder before sending.",
    );
  } else if (!req.certificateHolder.address.line1) {
    add(
      "holder.address",
      "warning",
      "Certificate holder address missing",
      `Found "${req.certificateHolder.name}" but no mailing address. Add it before sending.`,
    );
  }
  if (!req.namedInsured.name) {
    add(
      "insured.missing",
      "warning",
      "Named insured not identified",
      "The contract does not name the party carrying the insurance. Fill in the insured from the client file.",
    );
  }

  const core: Array<[keyof typeof c, string]> = [
    ["generalLiability", "General Liability"],
    ["autoLiability", "Automobile Liability"],
    ["workersComp", "Workers Compensation"],
  ];
  for (const [key, label] of core) {
    const line = c[key] as { required: boolean };
    if (!line.required) {
      add(
        `${key}.notRequired`,
        "warning",
        `${label} not found in the contract`,
        `Construction contracts almost always require ${label}. Confirm the contract really leaves it out before sending a cert without it.`,
      );
    }
  }

  const gl = c.generalLiability;
  if (gl.required && gl.limits.eachOccurrence === null && gl.limits.generalAggregate === null) {
    add("gl.noLimits", "warning", "No General Liability limits stated", "GL is required but no minimum limits were found. Use the client's actual limits.");
  }
  const auto = c.autoLiability;
  const autoHasLimit = Object.values(auto.limits).some((v) => v !== null);
  if (auto.required && !autoHasLimit) {
    add("auto.noLimits", "warning", "No auto liability limit stated", "Auto is required but no minimum limit was found.");
  }
  const ux = c.umbrellaExcess;
  if (ux.required && ux.limits.eachOccurrence === null) {
    add("umbrella.noLimits", "warning", "Umbrella required with no limit", "The contract asks for umbrella/excess coverage without a minimum limit.");
  }
  const wc = c.workersComp;
  if (wc.required && Object.values(wc.employersLiability).every((v) => v === null)) {
    add("wc.noEl", "info", "No employers liability limits stated", "Workers comp is required but EL limits were not stated. Show the client's actual EL limits.");
  }

  if (ux.required && ux.limits.eachOccurrence !== null && gl.limits.eachOccurrence !== null) {
    if (ux.limits.eachOccurrence < gl.limits.eachOccurrence) {
      add(
        "umbrella.belowGl",
        "warning",
        "Umbrella limit is below the GL limit",
        `Umbrella each occurrence (${money(ux.limits.eachOccurrence)}) is lower than GL each occurrence (${money(gl.limits.eachOccurrence)}). Recheck the contract.`,
      );
    }
  }

  const s = req.descriptionOfOperations.structured;
  const anyAi = gl.addlInsured || auto.addlInsured || ux.addlInsured || c.other.some((o) => o.addlInsured);
  if (s.additionalInsured.isRequiredByContract && !anyAi) {
    add("ai.noLine", "warning", "Additional insured required on no specific policy", "The contract requires additional insured status but no policy line was flagged. It is usually GL and auto.");
  }
  const anyWos = gl.subrogationWaived || auto.subrogationWaived || ux.subrogationWaived || wc.subrogationWaived;
  if (s.waiverOfSubrogation && !anyWos) {
    add("wos.noLine", "warning", "Waiver of subrogation required on no specific policy", "The contract requires a waiver of subrogation but no policy line was flagged.");
  }

  if (req.cancellation.noticeDays) {
    add(
      "cancellation.notice",
      "info",
      `Contract asks for ${req.cancellation.noticeDays} days notice of cancellation`,
      "The ACORD 25 cancellation wording is fixed (notice per policy provisions). Confirm the policy carries a notice of cancellation endorsement if the contract needs one.",
    );
  }

  const forms = [...req.endorsements.additionalInsuredForms, ...req.endorsements.otherRequiredForms];
  if (forms.length > 0) {
    add(
      "endorsements.forms",
      "info",
      "Attach the endorsements the contract names",
      `Forms named in the contract: ${Array.from(new Set(forms)).join(", ")}. Attach copies, or equivalent forms, with the cert.`,
    );
  }
  if (gl.addlInsured && (s.additionalInsured.scope === "both" || s.additionalInsured.scope === "completedOperations")) {
    const years = req.endorsements.completedOperationsYears;
    add(
      "ai.completedOps",
      "info",
      "Completed operations additional insured required",
      `Confirm the GL policy carries completed operations AI (e.g. CG 20 37)${years ? ` for at least ${years} years after completion` : ""}.`,
    );
  }

  const others = c.other.filter((o) => o.required);
  const onForm = formOtherCoverage(req);
  const rest = others.filter((o) => o !== onForm);
  if (onForm && rest.length > 0) {
    const withLimits = rest.filter((o) => o.limits.some((l) => l.amount !== null));
    const noLimits = rest.filter((o) => !o.limits.some((l) => l.amount !== null));
    add(
      "other.overflow",
      "info",
      `${others.length} other coverages required`,
      `The ACORD 25 has one OTHER row; ${onForm.coverageName} is on it.` +
        (withLimits.length
          ? ` ${withLimits.map((o) => o.coverageName).join(", ")} ${withLimits.length === 1 ? "is" : "are"} listed in the description of operations.`
          : "") +
        (noLimits.length
          ? ` ${noLimits.map((o) => o.coverageName).join(", ")} ${noLimits.length === 1 ? "has" : "have"} no stated limit: show the policy on an ACORD 101 or confirm it with the client.`
          : ""),
    );
  }

  for (const [i, cr] of c.conditionalRequirements.entries()) {
    if (cr.appliesToThisWork === "no") continue;
    add(
      `conditional.${i}`,
      "warning",
      cr.appliesToThisWork === "yes"
        ? `Applies to this job: ${cr.trigger}`
        : `Check whether this applies: ${cr.trigger}`,
      `${cr.requirement}. ${cr.reason} Not shown on the example cert, which uses the base requirements. (p.${cr.page})`,
    );
  }

  for (const [i, sr] of req.specialRequirements.entries()) {
    add(`special.${i}`, "info", sr.requirement, `Page ${sr.page}: "${sr.excerpt}"`);
  }

  const unverified = evidence.filter((e) => !e.verified);
  if (unverified.length > 0) {
    add(
      "evidence.unverified",
      "warning",
      `${unverified.length} quote${unverified.length === 1 ? "" : "s"} could not be matched to the contract text`,
      "These values may be misread. Check them against the contract: " +
        unverified
          .slice(0, 5)
          .map((e) => `${e.section} ${e.field} (p.${e.page})`)
          .join("; ") +
        (unverified.length > 5 ? "; …" : ""),
    );
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return checks.sort((a, b) => order[a.severity] - order[b.severity]);
}
