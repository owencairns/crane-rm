"use client"

import { useId, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Scale,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  FileText,
  PlayCircle,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DUAL_WAGE_CLASSES,
  resolveEffectiveDate,
  CURRENT_EFFECTIVE_DATE,
} from "@/lib/dual-wage-thresholds"
import {
  ANNUAL_HOURS,
  calculateEmployee,
  money,
  moneyPrecise,
  type EmployeeResult,
} from "@/lib/threshold-calculator"

const EXPLAINER_VIDEO =
  "https://thresholdcalculator.com/wp-content/uploads/2024/12/Dual-Wage-Threshold-Changes-On-Your-Work-Comp.mp4"
// WCIRB's own five-year threshold table, mirrored into public/ so it cannot break
// from under us. Source: https://www.wcirb.com/sites/default/files/2026-05/5year-dualwagethresholds.pdf
const WCIRB_THRESHOLD_TABLE_PDF = "/wcirb-dual-wage-thresholds.pdf"

interface EmployeeRow {
  id: string
  name: string
  classCode: string
  currentWage: string
  overRate: string
  underRate: string
}

function blankRow(id: string): EmployeeRow {
  return {
    id,
    name: "",
    classCode: "",
    currentWage: "",
    overRate: "",
    underRate: "",
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const selectClasses =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

export default function ThresholdCalculatorPage() {
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState(todayISO)
  const idPrefix = useId()
  const rowSeq = useRef(0)
  const [rows, setRows] = useState<EmployeeRow[]>(() => [
    blankRow(`${idPrefix}row-0`),
  ])
  const [results, setResults] = useState<EmployeeResult[] | null>(null)

  const governingDate = resolveEffectiveDate(policyEffectiveDate)
  const thresholdsAreCurrent = governingDate === CURRENT_EFFECTIVE_DATE

  function update(id: string, patch: Partial<EmployeeRow>) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
    setResults(null)
  }

  function addRow() {
    rowSeq.current += 1
    setRows((prev) => [...prev, blankRow(`${idPrefix}row-${rowSeq.current}`)])
    setResults(null)
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)))
    setResults(null)
  }

  const completeRows = rows.filter(
    (row) =>
      row.classCode !== "" &&
      row.currentWage.trim() !== "" &&
      row.overRate.trim() !== "" &&
      row.underRate.trim() !== "" &&
      Number.isFinite(Number(row.currentWage)) &&
      Number.isFinite(Number(row.overRate)) &&
      Number.isFinite(Number(row.underRate))
  )
  const canSubmit = completeRows.length > 0

  function handleSubmit() {
    const computed = completeRows
      .map((row, index) =>
        calculateEmployee(
          {
            id: row.id,
            name: row.name.trim() || `Employee ${index + 1}`,
            classCode: row.classCode,
            currentWage: Number(row.currentWage),
            overRate: Number(row.overRate),
            underRate: Number(row.underRate),
          },
          policyEffectiveDate
        )
      )
      .filter((r): r is EmployeeResult => r !== null)
    setResults(computed)
  }

  const totals = useMemo(() => {
    if (!results) return null
    const actionable = results.filter((r) => r.worthIt)
    return {
      actionable: actionable.length,
      netSavings: actionable.reduce((sum, r) => sum + r.netSavings, 0),
      raiseCost: actionable.reduce((sum, r) => sum + r.wageIncreaseCost, 0),
    }
  }, [results])

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Threshold Calculator
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            California splits most construction classifications into a pair of
            class codes, divided by an hourly wage threshold. Pay an employee
            below it and you rate at the expensive code. Because work comp is
            priced per $100 of payroll, nudging someone over the line can save
            more premium than the raise costs. This calculator works out whether it
            does.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a href={EXPLAINER_VIDEO} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <PlayCircle className="w-4 h-4" />
              Watch the explainer
            </Button>
          </a>
          <a
            href={WCIRB_THRESHOLD_TABLE_PDF}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <FileText className="w-4 h-4" />
              WCIRB threshold table (PDF)
            </Button>
          </a>
        </div>

        <Card className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="space-y-2 sm:max-w-xs w-full">
              <Label htmlFor="policy-date">Policy effective date</Label>
              <Input
                id="policy-date"
                type="date"
                value={policyEffectiveDate}
                onChange={(e) => {
                  setPolicyEffectiveDate(e.target.value)
                  setResults(null)
                }}
              />
            </div>
            <div className="pb-1">
              <Badge variant="secondary" className="gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                Using WCIRB thresholds effective{" "}
                {new Date(`${governingDate}T00:00:00`).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" }
                )}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Thresholds apply to policies incepting on or after each September 1.
            {!thresholdsAreCurrent &&
              " This date falls under a prior year's table, so the figures below are historical."}
          </p>

          <Separator />

          <div className="space-y-4">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className="rounded-lg border border-border/60 bg-background p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Employee {index + 1}
                  </p>
                  {rows.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`name-${row.id}`}>Employee name</Label>
                    <Input
                      id={`name-${row.id}`}
                      value={row.name}
                      placeholder="Javier"
                      onChange={(e) => update(row.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`class-${row.id}`}>Class code</Label>
                    <select
                      id={`class-${row.id}`}
                      className={selectClasses}
                      value={row.classCode}
                      onChange={(e) =>
                        update(row.id, { classCode: e.target.value })
                      }
                    >
                      <option value="">Select class code</option>
                      {DUAL_WAGE_CLASSES.map((cls) => (
                        <option key={cls.code} value={cls.code}>
                          {cls.label} {cls.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`wage-${row.id}`}>Current wage ($/hr)</Label>
                    <Input
                      id={`wage-${row.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.currentWage}
                      placeholder="40.00"
                      onChange={(e) =>
                        update(row.id, { currentWage: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`over-${row.id}`}>Over net rate</Label>
                    <Input
                      id={`over-${row.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.overRate}
                      placeholder="5.00"
                      onChange={(e) =>
                        update(row.id, { overRate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`under-${row.id}`}>Under net rate</Label>
                    <Input
                      id={`under-${row.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.underRate}
                      placeholder="9.00"
                      onChange={(e) =>
                        update(row.id, { underRate: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={addRow} className="gap-2">
              <Plus className="w-4 h-4" />
              Add an employee
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
              Calculate
            </Button>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Info className="w-4 h-4" />
              Before you run this
            </div>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>
                Wages are assumed to be {ANNUAL_HOURS.toLocaleString()} hours a
                year, based on 40-hour weeks.
              </li>
              <li>
                Enter your <strong>net</strong> rates, not base rates, or the
                numbers will be wrong.
              </li>
              <li>
                The over rate applies above the threshold and should be the
                cheaper of the two. The under rate is the more expensive one.
              </li>
              <li>
                Unsure of your net rates? Call us at{" "}
                <a href="tel:+16505969500" className="text-primary underline">
                  (650) 596-9500
                </a>{" "}
                and we will work them out with you.
              </li>
            </ul>
          </div>
        </Card>

        {results && results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Results</h2>

            {totals && (
              <Card className="p-6 bg-primary/5 border-primary/20">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Raises worth giving
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {totals.actionable} of {results.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Cost of those raises
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {money(totals.raiseCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Net savings after the raises
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {money(totals.netSavings)}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: "positive" | "negative"
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          emphasis === "positive" && "text-emerald-600",
          emphasis === "negative" && "text-destructive"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function ResultCard({ result: r }: { result: EmployeeResult }) {
  const cls = DUAL_WAGE_CLASSES.find((c) => c.code === r.classCode)

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{r.name}</p>
          <p className="text-sm text-muted-foreground">
            {cls?.label} {r.classCode}
          </p>
        </div>
        {r.alreadyOver ? (
          <Badge variant="secondary" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Already over the threshold
          </Badge>
        ) : r.worthIt ? (
          <Badge className="gap-1.5 bg-emerald-600 hover:bg-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Worth the raise
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Not worth it
          </Badge>
        )}
      </div>

      {r.alreadyOver ? (
        <p className="text-sm text-muted-foreground">
          {r.name} earns {moneyPrecise(r.currentWage)} an hour, at or above the{" "}
          {moneyPrecise(r.threshold)} threshold, so they already rate at the
          cheaper code. Nothing to do here.
        </p>
      ) : (
        <>
          <Separator />
          <div className="divide-y divide-border/60">
            <Row
              label="Wage threshold"
              value={`${moneyPrecise(r.threshold)} / hr`}
            />
            <Row
              label="Current wage"
              value={`${moneyPrecise(r.currentWage)} / hr`}
            />
            <Row
              label="Raise required"
              value={`${moneyPrecise(r.raisePerHour)} / hr`}
            />
            <Row
              label="Current annual wages"
              value={money(r.currentAnnualWages)}
            />
            <Row
              label="Annual wages after the raise"
              value={money(r.newAnnualWages)}
            />
            <Row
              label="Cost of wage increase"
              value={money(r.wageIncreaseCost)}
              emphasis="negative"
            />
            <Row
              label="Work comp savings"
              value={money(r.workCompSavings)}
              emphasis="positive"
            />
          </div>
          <div className="rounded-lg bg-muted/50 p-4 flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium text-foreground">
              Amount of savings
            </span>
            <span
              className={cn(
                "text-xl font-bold tabular-nums",
                r.netSavings > 0 ? "text-emerald-600" : "text-destructive"
              )}
            >
              {money(r.netSavings)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {r.worthIt
              ? `Give ${r.name} a ${moneyPrecise(r.raisePerHour)} an hour raise. It costs ${money(r.wageIncreaseCost)} in payroll and saves ${money(r.workCompSavings)} in work comp, so you come out ${money(r.netSavings)} ahead and they take home more.`
              : `The raise costs ${money(r.wageIncreaseCost)} and only saves ${money(r.workCompSavings)} in work comp, so it does not pay for itself. ${r.name} is too far below the threshold to be worth moving.`}
          </p>
        </>
      )}
    </Card>
  )
}
