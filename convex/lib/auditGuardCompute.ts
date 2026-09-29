import type {
  PolicyLine,
  PolicyExtraction,
  FinancialInputs,
  FinancialInputValue,
  FinancialInputRequest,
  LineEstimate,
  EstimateSummary,
  RatingBasis,
} from "./auditGuardSchemas";

/* ------------------------------------------------------------------ */
/*  AuditGuard — deterministic estimate math                          */
/*                                                                    */
/*  The dollar figure a client budgets against must be reproducible,  */
/*  not model-generated. Stage 1 (LLM) tells us how each line is      */
/*  rated; everything here is plain arithmetic so the estimate is     */
/*  auditable and stable.                                             */
/* ------------------------------------------------------------------ */

// Bases that require a financial figure from the user. "flat"/"unknown"
// lines can't be projected from a number the user enters.
const INPUT_BASES: RatingBasis[] = [
  "revenue",
  "payroll",
  "subcontracted_cost",
  "units",
];

// The financial-input key a line draws from. Lines on the same basis +
// class code share a key so the user enters each figure once.
export function inputKeyForLine(line: PolicyLine): string | null {
  if (!line.auditable || !INPUT_BASES.includes(line.ratingBasis)) return null;
  const state = normalizeState(line.state);
  const statePart = state ? `:${state}` : "";
  const code = line.classCode ? `:${line.classCode}` : "";
  switch (line.ratingBasis) {
    case "revenue":
      return `revenue${statePart}${code}`;
    case "payroll":
      return `payroll${statePart}${code}`;
    case "subcontracted_cost":
      return `subcontracted_cost${statePart}${code}`;
    case "units":
      // Units are line-specific (per-vehicle counts don't pool).
      return `units:${line.lineId}`;
    default:
      return null;
  }
}

/**
 * Collapse duplicate extracted class lines caused by policy packages printing
 * the same schedule on declarations, extensions, and endorsements.
 */
export function dedupeLines(lines: PolicyLine[]): PolicyLine[] {
  const seenLineKeys = new Set<string>();
  const deduped: PolicyLine[] = [];

  for (const line of lines) {
    const lineKey = JSON.stringify([
      // lineOfBusiness disambiguates lines whose rating fields are all
      // null (e.g. two distinct flat endorsement lines) — only true
      // reprints of the same class schedule should collapse.
      line.lineOfBusiness,
      line.ratingBasis,
      line.classCode ?? null,
      normalizeState(line.state),
      line.ratePerUnit ?? null,
      line.boundExposure ?? null,
    ]);
    if (seenLineKeys.has(lineKey)) continue;
    seenLineKeys.add(lineKey);
    deduped.push({ ...line });
  }

  const usedIds = new Set<string>();
  const nextSuffixByBase = new Map<string, number>();
  return deduped.map((line) => {
    const baseId = line.lineId || "line";
    let candidate = baseId;
    if (usedIds.has(candidate)) {
      let suffix = nextSuffixByBase.get(baseId) ?? 2;
      do {
        candidate = `${baseId}-${suffix}`;
        suffix += 1;
      } while (usedIds.has(candidate));
      nextSuffixByBase.set(baseId, suffix);
    } else {
      nextSuffixByBase.set(baseId, 2);
    }
    usedIds.add(candidate);
    return candidate === line.lineId ? line : { ...line, lineId: candidate };
  });
}

function baseLabel(basis: RatingBasis): string {
  switch (basis) {
    case "revenue":
      return "Projected annual gross receipts";
    case "payroll":
      return "Projected annual payroll";
    case "subcontracted_cost":
      return "Projected annual subcontracted cost";
    case "units":
      return "Projected unit count";
    default:
      return "Projected exposure";
  }
}

/**
 * Build the dynamic "here's what to enter" checklist from the extracted
 * policy lines. One request per distinct exposure figure the policies
 * are rated on — this is what makes the basis (revenue vs payroll vs …)
 * a function of the actual policies rather than a fixed form.
 */
export function deriveInputRequests(
  lines: PolicyLine[]
): FinancialInputRequest[] {
  const byKey = new Map<string, FinancialInputRequest>();

  for (const line of lines) {
    const key = inputKeyForLine(line);
    if (!key) continue;

    const existing = byKey.get(key);
    if (existing) {
      existing.appliesToLineIds.push(line.lineId);
      continue;
    }

    const state = normalizeState(line.state);
    const stateSuffix = state ? ` — ${state}` : "";
    const classSuffix = line.classCodeDescription
      ? ` — ${line.classCodeDescription}${
          line.classCode ? ` (class ${line.classCode})` : ""
        }`
      : line.classCode
        ? ` — class ${line.classCode}`
        : "";

    byKey.set(key, {
      key,
      label: `${baseLabel(line.ratingBasis)}${stateSuffix}${classSuffix}`,
      basis: line.ratingBasis,
      classCode: line.classCode,
      state,
      unit: line.ratingBasis === "units" ? "count" : "dollars",
      appliesToLineIds: [line.lineId],
      helpText:
        line.ratingBasis === "payroll"
          ? "Workers' Comp is rated on payroll. Enter projected payroll for this class."
          : line.ratingBasis === "revenue"
            ? "General Liability is rated on gross receipts. Enter projected annual revenue."
            : undefined,
    });
  }

  return Array.from(byKey.values());
}

/**
 * Project the year-end audit true-up for a single line:
 *   additionalPremium = ((projectedExposure − boundExposure) / unitSize) × rate
 */
export function estimateLine(
  line: PolicyLine,
  inputs: FinancialInputs
): LineEstimate {
  const inputKey = inputKeyForLine(line);

  if (!line.auditable || inputKey === null) {
    return {
      lineId: line.lineId,
      status: "not_auditable",
      inputKey: null,
      rawExposure: null,
      projectedExposure: null,
      annualized: false,
      additionalExposure: null,
      additionalPremium: null,
      projectedPremium: line.currentPremium ?? null,
      reasoning:
        line.ratingBasis === "flat"
          ? "Flat-charged line — not subject to a revenue/payroll audit true-up."
          : "Line is not exposure-rated, so no audit projection is possible.",
    };
  }

  const input = inputs[inputKey];
  if (input === undefined || input === null) {
    return {
      lineId: line.lineId,
      status: "needs_input",
      inputKey,
      rawExposure: null,
      projectedExposure: null,
      annualized: false,
      additionalExposure: null,
      additionalPremium: null,
      projectedPremium: null,
      reasoning: `Awaiting projected ${line.ratingBasis} to estimate this line.`,
    };
  }

  const {
    rawExposure,
    projectedExposure,
    annualized,
    annualizationReasoning,
  } = normalizeFinancialInput(input);

  const effectiveRate = effectiveRatePerUnit(line);
  if (effectiveRate === null || line.boundExposure === null || !line.unitSize) {
    return {
      lineId: line.lineId,
      status: "insufficient_data",
      inputKey,
      rawExposure,
      projectedExposure,
      annualized,
      additionalExposure: null,
      additionalPremium: null,
      projectedPremium: null,
      reasoning:
        annualizationReasoning +
        "Policy did not show enough to price this line — missing the rate or the bound exposure. Confirm these with the carrier.",
    };
  }

  const additionalExposure = projectedExposure - line.boundExposure;
  const rawManualDelta = (additionalExposure / line.unitSize) * effectiveRate;
  const modifiers = validPremiumModifiers(line);
  const modifierProduct = modifiers.reduce(
    (product, modifier) => product * modifier.factor,
    1
  );
  const additionalPremium = rawManualDelta * modifierProduct;
  const boundPremium =
    line.currentPremium ??
    (line.boundExposure / line.unitSize) * effectiveRate * modifierProduct;
  const projectedPremium = boundPremium + additionalPremium;
  const rateReasoning = rateComponentsReasoning(line, effectiveRate);
  const modifierReasoning = modifiers.length
    ? ` ${modifiers
        .map((modifier) => `× ${formatFactor(modifier.factor)} ${modifier.label}`)
        .join(" ")}`
    : "";

  return {
    lineId: line.lineId,
    status: "estimated",
    inputKey,
    rawExposure,
    projectedExposure,
    annualized,
    additionalExposure,
    additionalPremium: round2(additionalPremium),
    projectedPremium: round2(projectedPremium),
    reasoning:
      annualizationReasoning +
      `Projected ${formatBasis(line.ratingBasis)} of ${money(projectedExposure)} vs ` +
      `${money(line.boundExposure)} bound → ${money(additionalExposure)} additional exposure ` +
      `at ${rateReasoning} per ${money(line.unitSize)} = ${money(round2(rawManualDelta))} manual premium delta` +
      `${modifierReasoning}, for ${money(round2(additionalPremium))} estimated audit premium.`,
  };
}

export function computeEstimates(
  lines: PolicyLine[],
  inputs: FinancialInputs,
  options: Partial<Pick<PolicyExtraction, "minimumPremium" | "expenseConstant">> = {}
): { estimates: LineEstimate[]; summary: EstimateSummary } {
  const estimates = lines.map((line) => estimateLine(line, inputs));
  const estimated = estimates.filter((e) => e.status === "estimated");

  const sum = (vals: Array<number | null>) =>
    vals.some((v) => v !== null)
      ? round2(vals.reduce<number>((acc, v) => acc + (v ?? 0), 0))
      : null;

  const totalCurrentPremium = sum(lines.map((l) => l.currentPremium));
  const totalAdditionalPremium = sum(estimated.map((e) => e.additionalPremium));
  const computedProjectedPremium = sum(estimated.map((e) => e.projectedPremium));
  const premiumFloor = computePremiumFloor(
    options.minimumPremium,
    options.expenseConstant
  );
  const floorApplied =
    computedProjectedPremium !== null &&
    premiumFloor !== null &&
    computedProjectedPremium < premiumFloor;
  const totalProjectedPremium = floorApplied
    ? premiumFloor
    : computedProjectedPremium;
  const floorLift =
    floorApplied && computedProjectedPremium !== null
      ? round2(premiumFloor - computedProjectedPremium)
      : 0;
  // The deposit the client already paid was itself subject to the floor —
  // if their current premium is at or above it, the floor doesn't create
  // any NEW additional premium at audit; it only props up the projection.
  const depositAlreadyAtFloor =
    premiumFloor !== null &&
    totalCurrentPremium !== null &&
    totalCurrentPremium >= premiumFloor;
  const adjustedAdditionalPremium =
    floorApplied && totalAdditionalPremium !== null && !depositAlreadyAtFloor
      ? round2(totalAdditionalPremium + floorLift)
      : totalAdditionalPremium;

  return {
    estimates,
    summary: {
      lineCount: lines.length,
      estimatedLineCount: estimated.length,
      totalCurrentPremium,
      totalProjectedPremium,
      totalAdditionalPremium: adjustedAdditionalPremium,
      premiumFloor,
      floorApplied,
      floorReasoning:
        premiumFloor === null
          ? null
          : floorApplied
            ? `Projected premium was floored at minimum premium + expense constant (${money(premiumFloor)}).`
            : `Minimum premium + expense constant floor is ${money(premiumFloor)}; projected premium is above the floor.`,
    },
  };
}

/* ---- formatting helpers ---- */

function normalizeFinancialInput(input: number | FinancialInputValue): {
  rawExposure: number;
  projectedExposure: number;
  annualized: boolean;
  annualizationReasoning: string;
} {
  if (typeof input === "number") {
    return {
      rawExposure: input,
      projectedExposure: input,
      annualized: false,
      annualizationReasoning: "",
    };
  }

  const rawExposure = input.amount;
  const monthsCovered = input.monthsCovered;
  const shouldAnnualize =
    monthsCovered !== undefined &&
    Number.isFinite(monthsCovered) &&
    monthsCovered > 0 &&
    monthsCovered < 11;

  if (!shouldAnnualize) {
    return {
      rawExposure,
      projectedExposure: rawExposure,
      annualized: false,
      annualizationReasoning: "",
    };
  }

  const projectedExposure = (rawExposure * 12) / monthsCovered;
  return {
    rawExposure,
    projectedExposure,
    annualized: true,
    annualizationReasoning: `Partial-period figure (${money(rawExposure)} over ${monthsCovered} months) annualized to ${money(projectedExposure)}. `,
  };
}

function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  return normalized || null;
}

function effectiveRatePerUnit(line: PolicyLine): number | null {
  const components = validRateComponents(line);
  if (components.length > 0) {
    return round6(
      components.reduce((sum, component) => sum + component.ratePerUnit, 0)
    );
  }
  return line.ratePerUnit ?? null;
}

function validRateComponents(line: PolicyLine): Array<{
  label: string;
  ratePerUnit: number;
}> {
  return (line.rateComponents ?? []).filter(
    (component) =>
      component &&
      Number.isFinite(component.ratePerUnit) &&
      component.ratePerUnit >= 0
  );
}

function validPremiumModifiers(line: PolicyLine): Array<{
  label: string;
  factor: number;
}> {
  return (line.premiumModifiers ?? []).filter(
    (modifier) =>
      modifier && Number.isFinite(modifier.factor) && modifier.factor > 0
  );
}

function rateComponentsReasoning(line: PolicyLine, effectiveRate: number) {
  const components = validRateComponents(line);
  if (components.length === 0) return money(effectiveRate);
  return `${money(effectiveRate)} (${components
    .map((component) => `${component.label}: ${money(component.ratePerUnit)}`)
    .join(" + ")})`;
}

function computePremiumFloor(
  minimumPremium: number | null | undefined,
  expenseConstant: number | null | undefined
): number | null {
  if (
    minimumPremium === null ||
    minimumPremium === undefined ||
    expenseConstant === null ||
    expenseConstant === undefined ||
    !Number.isFinite(minimumPremium) ||
    !Number.isFinite(expenseConstant)
  ) {
    return null;
  }
  return round2(minimumPremium + expenseConstant);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatFactor(n: number): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatBasis(basis: RatingBasis): string {
  switch (basis) {
    case "revenue":
      return "revenue";
    case "payroll":
      return "payroll";
    case "subcontracted_cost":
      return "subcontracted cost";
    case "units":
      return "units";
    default:
      return "exposure";
  }
}
