/**
 * California dual wage classification thresholds, published by the WCIRB.
 *
 * Construction classifications come in pairs. Which half of the pair an
 * employee falls into is decided by their hourly wage: at or above the
 * threshold they rate at the cheaper "over" rate, below it they rate at the
 * more expensive "under" rate. The WCIRB republishes the thresholds every
 * year and they apply to policies with an effective date on or after
 * September 1 of that year, until the next dated threshold supersedes them.
 *
 * Source data and citations live in `docs/wcirb-dual-wage-thresholds.json`.
 * When the WCIRB publishes a new year, add an entry to EFFECTIVE_DATES and a
 * value to every classification's `thresholds` map. Nothing else changes.
 */

export interface DualWageClass {
  /** Value used in the form and in saved rows. Also the WCIRB pair order. */
  code: string
  /** Chris's label from the original thresholdcalculator.com dropdown. */
  label: string
  /** Full WCIRB phraseology, shown as help text. */
  description: string
  /** Hourly threshold keyed by the September 1 effective date it starts on. */
  thresholds: Record<string, number>
}

/** Newest last. Each is the September 1 the threshold takes effect. */
export const EFFECTIVE_DATES = [
  "2021-09-01",
  "2022-09-01",
  "2023-09-01",
  "2024-09-01",
  "2025-09-01",
  "2026-09-01",
] as const

export const CURRENT_EFFECTIVE_DATE =
  EFFECTIVE_DATES[EFFECTIVE_DATES.length - 1]

/**
 * Ordered the way Chris's original dropdown ordered them (alphabetical by
 * label), so the tool reads the same to anyone who used the old site.
 *
 * Note: the old site listed Steel Framing as 6532/5633. That was a typo —
 * the WCIRB pair is 5632/5633, corrected here.
 */
export const DUAL_WAGE_CLASSES: DualWageClass[] = [
  {
    code: "5185/5186",
    label: "Automatic Sprinkler Install",
    description: "Automatic Sprinkler Installation",
    thresholds: {
      "2021-09-01": 29,
      "2022-09-01": 32,
      "2023-09-01": 32,
      "2024-09-01": 33,
      "2025-09-01": 33,
      "2026-09-01": 36,
    },
  },
  {
    code: "5403/5432",
    label: "Carpentry",
    description: "Carpentry",
    thresholds: {
      "2021-09-01": 35,
      "2022-09-01": 39,
      "2023-09-01": 39,
      "2024-09-01": 41,
      "2025-09-01": 41,
      "2026-09-01": 46,
    },
  },
  {
    code: "5201/5205",
    label: "Concrete or Cement",
    description:
      "5201(1)/5205(1), Concrete or Cement Work — pouring or finishing of concrete sidewalks, driveways, patios, curbs or gutters; 5201(2)/5205(2), Concrete or Cement Work — pouring or finishing of concrete floor slabs, poured in place and on the ground, and concrete slab-type foundations, for other than concrete buildings or structural steel buildings of multi-story construction",
    thresholds: {
      "2021-09-01": 28,
      "2022-09-01": 32,
      "2023-09-01": 32,
      "2024-09-01": 33,
      "2025-09-01": 33,
      "2026-09-01": 36,
    },
  },
  {
    code: "5140/5190",
    label: "Electrical Wiring",
    description: "Electrical Wiring",
    thresholds: {
      "2021-09-01": 32,
      "2022-09-01": 34,
      "2023-09-01": 34,
      "2024-09-01": 36,
      "2025-09-01": 36,
      "2026-09-01": 40,
    },
  },
  {
    code: "6218/6220",
    label: "Excavation, Grading, Leveling",
    description:
      "6218(1)/6220(1), Excavation; 6218(2)/6220(2), Grading Land; 6218(3)/6220(3), Land Leveling",
    thresholds: {
      "2021-09-01": 34,
      "2022-09-01": 39,
      "2023-09-01": 38,
      "2024-09-01": 40,
      "2025-09-01": 40,
      "2026-09-01": 45,
    },
  },
  {
    code: "5467/5470",
    label: "Glaziers",
    description: "Glaziers",
    thresholds: {
      "2021-09-01": 33,
      "2022-09-01": 36,
      "2023-09-01": 36,
      "2024-09-01": 39,
      "2025-09-01": 39,
      "2026-09-01": 43,
    },
  },
  {
    code: "5027/5028",
    label: "Masonry",
    description: "Masonry",
    thresholds: {
      "2021-09-01": 28,
      "2022-09-01": 32,
      "2023-09-01": 32,
      "2024-09-01": 35,
      "2025-09-01": 35,
      "2026-09-01": 37,
    },
  },
  {
    code: "5474/5482",
    label: "Painting, Wallpaper, Waterproofing, Tank Painting",
    description:
      "5474(1)/5482(1), Painting or Wallpaper Installation; 5474(2)/5482(2), Waterproofing; 5474(3)/5482(3), Painting — water, oil or gasoline storage tanks",
    thresholds: {
      "2021-09-01": 28,
      "2022-09-01": 31,
      "2023-09-01": 31,
      "2024-09-01": 32,
      "2025-09-01": 32,
      "2026-09-01": 36,
    },
  },
  {
    code: "5484/5485",
    label: "Plaster and Stucco",
    description: "Plastering or Stucco Work",
    thresholds: {
      "2021-09-01": 32,
      "2022-09-01": 36,
      "2023-09-01": 36,
      "2024-09-01": 38,
      "2025-09-01": 38,
      "2026-09-01": 42,
    },
  },
  {
    code: "5183/5187",
    label: "Plumbing & HVAC",
    description:
      "5183(1)/5187(1), Plumbing; 5183(2)/5187(2), Refrigeration Equipment; 5183(3)/5187(3), Heating or Air Conditioning Equipment",
    thresholds: {
      "2021-09-01": 28,
      "2022-09-01": 31,
      "2023-09-01": 31,
      "2024-09-01": 32,
      "2025-09-01": 32,
      "2026-09-01": 35,
    },
  },
  {
    code: "5552/5553",
    label: "Roofing",
    description: "Roofing",
    thresholds: {
      "2021-09-01": 27,
      "2022-09-01": 29,
      "2023-09-01": 29,
      "2024-09-01": 31,
      "2025-09-01": 31,
      "2026-09-01": 33,
    },
  },
  {
    code: "6307/6308",
    label: "Sewer Construction",
    description: "Sewer Construction",
    thresholds: {
      "2021-09-01": 34,
      "2022-09-01": 39,
      "2023-09-01": 38,
      "2024-09-01": 40,
      "2025-09-01": 40,
      "2026-09-01": 45,
    },
  },
  {
    code: "5538/5542",
    label: "Sheet Metal & Duct Work",
    description:
      "5538(1)/5542(1), Sheet Metal Work; 5538(2)/5542(2), Heating or Air Conditioning Ductwork",
    thresholds: {
      "2021-09-01": 27,
      "2022-09-01": 29,
      "2023-09-01": 29,
      "2024-09-01": 33,
      "2025-09-01": 33,
      "2026-09-01": 37,
    },
  },
  {
    code: "5632/5633",
    label: "Steel Framing",
    description: "Steel Framing",
    thresholds: {
      "2021-09-01": 35,
      "2022-09-01": 39,
      "2023-09-01": 39,
      "2024-09-01": 41,
      "2025-09-01": 41,
      "2026-09-01": 46,
    },
  },
  {
    code: "5446/5447",
    label: "Wallboard Install",
    description: "Wallboard Installation",
    thresholds: {
      "2021-09-01": 36,
      "2022-09-01": 38,
      "2023-09-01": 38,
      "2024-09-01": 41,
      "2025-09-01": 41,
      "2026-09-01": 45,
    },
  },
  {
    code: "6315/6316",
    label: "Water and Gas Mains",
    description:
      "6315(1)/6316(1), Water Mains or Connections Construction; 6315(2)/6316(2), Gas Mains or Connections Construction",
    thresholds: {
      "2021-09-01": 34,
      "2022-09-01": 39,
      "2023-09-01": 38,
      "2024-09-01": 40,
      "2025-09-01": 40,
      "2026-09-01": 45,
    },
  },
]

export function getClass(code: string): DualWageClass | undefined {
  return DUAL_WAGE_CLASSES.find((c) => c.code === code)
}

/**
 * The effective date whose threshold governs a policy incepting on
 * `policyEffectiveDate` — the latest published date that is not in the
 * future relative to the policy. Policies that predate the table fall back
 * to the earliest published threshold.
 */
export function resolveEffectiveDate(policyEffectiveDate: string): string {
  const applicable = EFFECTIVE_DATES.filter((d) => d <= policyEffectiveDate)
  return applicable.length > 0
    ? applicable[applicable.length - 1]
    : EFFECTIVE_DATES[0]
}

/** Hourly wage threshold for a class under the governing effective date. */
export function getThreshold(
  code: string,
  policyEffectiveDate: string
): number | null {
  const cls = getClass(code)
  if (!cls) return null
  return cls.thresholds[resolveEffectiveDate(policyEffectiveDate)] ?? null
}
