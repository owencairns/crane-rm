import type { PolicyExtraction } from "./auditGuardSchemas";

/* ------------------------------------------------------------------ */
/*  Overseer correction application                                   */
/*                                                                    */
/*  The overseer can only nudge a handful of high-impact scalar       */
/*  fields on an existing line; every applied or guarded change is    */
/*  appended to that line's assumptions for human review.             */
/* ------------------------------------------------------------------ */

export const OVERSEER_SCALAR_FIELDS = new Set([
  "ratingBasis",
  "ratingBasisLabel",
  "unitSize",
  "ratePerUnit",
  "rateSource",
  "boundExposure",
  "currentPremium",
  "auditable",
  "classCode",
  "classCodeDescription",
  "state",
]);

// Corrections arrive as free-text JSON. Reject invalid enum strings instead
// of allowing a typo to corrupt a line and remove it from the input checklist.
export const OVERSEER_ENUM_FIELDS: Record<string, Set<string>> = {
  ratingBasis: new Set([
    "revenue",
    "payroll",
    "subcontracted_cost",
    "units",
    "flat",
    "unknown",
  ]),
  rateSource: new Set(["stated", "implied", "unknown"]),
};

export function coerceFieldValue(
  field: string,
  raw: string | null
): unknown {
  if (raw === null) return null;
  // Corrections are free-text JSON; models sometimes double-encode values
  // (e.g. "\"1500000\"" or "\"sales\""). Unwrap one layer of quotes.
  const unquoted = raw.replace(/^"([\s\S]*)"$/, "$1");
  if (
    field === "unitSize" ||
    field === "ratePerUnit" ||
    field === "boundExposure" ||
    field === "currentPremium"
  ) {
    const n = Number(unquoted);
    // A garbled number must skip the correction, not wipe the field to null.
    return Number.isFinite(n) ? n : undefined;
  }
  if (field === "auditable") return unquoted === "true" || unquoted === "1";
  const allowed = OVERSEER_ENUM_FIELDS[field];
  if (allowed && !allowed.has(unquoted)) return undefined;
  return unquoted;
}

export function applyOverseerCorrections(
  extraction: PolicyExtraction,
  corrections: Array<{
    action: "update" | "add";
    lineId: string;
    field: string;
    correctedValue: string | null;
    confidence: "high" | "medium" | "low";
    reasoning: string;
  }>
): PolicyExtraction {
  const lines = extraction.lines.map((line) => ({ ...line }));
  const byId = new Map(lines.map((line) => [line.lineId, line]));

  for (const correction of corrections) {
    if (correction.action !== "update") continue;
    if (!OVERSEER_SCALAR_FIELDS.has(correction.field)) continue;
    const line = byId.get(correction.lineId);
    if (!line) continue;

    const coerced = coerceFieldValue(
      correction.field,
      correction.correctedValue
    );
    if (coerced === undefined) continue;

    // A false negative here removes an otherwise valid line from the entire
    // financial-input checklist. Preserve extraction-stage true values; the
    // reverse false -> true correction remains allowed.
    if (
      correction.field === "auditable" &&
      line.auditable === true &&
      coerced === false
    ) {
      line.assumptions = [
        ...(line.assumptions ?? []),
        `Overseer proposed auditable=false but was rejected by guard (kept true): ${correction.reasoning}`,
      ];
      continue;
    }

    if (correction.confidence === "low") continue;

    (line as Record<string, unknown>)[correction.field] = coerced;
    line.assumptions = [
      ...(line.assumptions ?? []),
      `Overseer correction (${correction.field}): ${correction.reasoning}`,
    ];
  }

  return { ...extraction, lines };
}
