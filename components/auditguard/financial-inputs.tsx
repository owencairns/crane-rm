"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calculator, Loader2 } from "lucide-react"

export interface FinancialInputRequest {
  key: string
  label: string
  basis: string
  classCode: string | null
  unit: "dollars" | "count"
  appliesToLineIds: string[]
  helpText?: string
}

export interface FinancialInputValue {
  amount: number
  monthsCovered?: number
}

export type FinancialInputValues = Record<
  string,
  number | FinancialInputValue
>

interface FinancialInputsProps {
  requests: FinancialInputRequest[]
  initialValues?: FinancialInputValues | null
  submitting?: boolean
  onSubmit: (values: FinancialInputValues) => void
}

/**
 * The dynamic checklist that drives stage 2. Each row is a financial
 * figure AuditGuard worked out it needs from how the policies are rated —
 * payroll for a WC line, gross receipts for a GL line, and so on.
 */
export function FinancialInputs({
  requests,
  initialValues,
  submitting,
  onSubmit,
}: FinancialInputsProps) {
  const [raw, setRaw] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const req of requests) {
      const existing = initialValues?.[req.key]
      seed[req.key] =
        existing !== undefined
          ? String(typeof existing === "number" ? existing : existing.amount)
          : ""
    }
    return seed
  })
  const [monthsCovered, setMonthsCovered] = useState<Record<string, string>>(
    () => {
      const seed: Record<string, string> = {}
      for (const req of requests) {
        const existing = initialValues?.[req.key]
        seed[req.key] =
          typeof existing === "object" && existing.monthsCovered !== undefined
            ? String(existing.monthsCovered)
            : ""
      }
      return seed
    }
  )

  const allFilled = requests.every((req) => {
    const value = raw[req.key]?.trim()
    const months = monthsCovered[req.key]?.trim()
    const monthsValid =
      !months ||
      (Number.isFinite(Number(months)) && Number(months) > 0 && Number(months) <= 12)
    return (
      value !== "" &&
      value !== undefined &&
      !Number.isNaN(Number(value)) &&
      monthsValid
    )
  })

  function handleSubmit() {
    const values: FinancialInputValues = {}
    for (const req of requests) {
      const n = Number(raw[req.key])
      const months = Number(monthsCovered[req.key])
      if (!Number.isNaN(n)) {
        values[req.key] =
          monthsCovered[req.key]?.trim() &&
          Number.isFinite(months) &&
          months > 0 &&
          months < 12
            ? { amount: n, monthsCovered: months }
            : n
      }
    }
    onSubmit(values)
  }

  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No exposure-rated lines were found in this policy package, so there are
        no financials to enter.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {requests.map((req) => (
          <div key={req.key} className="space-y-1.5">
            <label
              htmlFor={`fin-${req.key}`}
              className="text-sm font-medium text-foreground"
            >
              {req.label}
            </label>
            <div className="flex items-center rounded-lg border border-border/60 bg-background focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              {req.unit === "dollars" && (
                <span className="pl-3 text-muted-foreground">$</span>
              )}
              <input
                id={`fin-${req.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                placeholder={req.unit === "dollars" ? "0" : "0"}
                value={raw[req.key] ?? ""}
                disabled={submitting}
                onChange={(e) =>
                  setRaw((prev) => ({ ...prev, [req.key]: e.target.value }))
                }
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-50"
              />
              <span className="pr-3 text-xs text-muted-foreground">
                {req.unit === "dollars" ? "/ yr" : "units"}
              </span>
            </div>
            {req.helpText && (
              <p className="text-xs text-muted-foreground">{req.helpText}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <label
                htmlFor={`months-${req.key}`}
                className="text-xs text-muted-foreground"
              >
                Months covered (optional)
              </label>
              <input
                id={`months-${req.key}`}
                type="number"
                inputMode="decimal"
                min={1}
                max={12}
                placeholder="12"
                value={monthsCovered[req.key] ?? ""}
                disabled={submitting}
                onChange={(e) =>
                  setMonthsCovered((prev) => ({
                    ...prev,
                    [req.key]: e.target.value,
                  }))
                }
                className="w-20 rounded-md border border-border/60 bg-background px-2 py-1 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
              />
              <span className="text-xs text-muted-foreground">
                Leave blank for a full year
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!allFilled || submitting}
          className="gap-2"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Calculator className="h-4 w-4" />
          )}
          Generate Estimate
        </Button>
      </div>
    </div>
  )
}
