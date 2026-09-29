"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import {
  FinancialInputs,
  type FinancialInputRequest,
  type FinancialInputValues,
} from "@/components/auditguard/financial-inputs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Calculator,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  ClipboardList,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

interface LineResult {
  id: string
  lineOfBusiness: string
  carrier?: string | null
  auditable: boolean
  ratingBasis: string
  ratingBasisLabel: string
  unitSize: number
  classCode?: string | null
  classCodeDescription?: string | null
  ratePerUnit?: number | null
  rateSource: string
  boundExposure?: number | null
  currentPremium?: number | null
  confidence: string
  assumptions: string[]
  state?: string | null
  notes?: string | null
  estimateStatus?: string | null
  rawExposure?: number | null
  projectedExposure?: number | null
  annualized?: boolean
  additionalExposure?: number | null
  additionalPremium?: number | null
  projectedPremium?: number | null
  estimateReasoning?: string | null
}

interface Results {
  reviewId: string
  status: string
  clientName?: string | null
  policyFilenames: string[]
  estimateSummary?: {
    lineCount: number
    estimatedLineCount: number
    totalCurrentPremium: number | null
    totalProjectedPremium: number | null
    totalAdditionalPremium: number | null
    premiumFloor?: number | null
    floorApplied?: boolean
    floorReasoning?: string | null
  }
  errorMessage?: string | null
  inputRequests: FinancialInputRequest[]
  financialInputs: FinancialInputValues | null
  lines: LineResult[]
}

const IN_FLIGHT = ["uploaded", "parsing", "extracting", "estimating"]

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return `$${Math.round(n).toLocaleString("en-US")}`
}

function statusBlurb(status: string): string {
  switch (status) {
    case "uploaded":
      return "Queued…"
    case "parsing":
      return "Reading the policy documents…"
    case "extracting":
      return "Working out how each line is rated…"
    case "estimating":
      return "Crunching the audit projection…"
    default:
      return "Working…"
  }
}

export default function AuditGuardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const reviewId = id as Id<"auditGuardReviews">
  const results = useQuery(api.auditGuardReviews.getResults, { reviewId }) as
    | Results
    | null
    | undefined
  const submitInputs = useMutation(api.auditGuardReviews.submitInputs)
  const reprocess = useMutation(api.auditGuardReviews.reprocessReview)
  const [submitting, setSubmitting] = useState(false)

  if (results === undefined) {
    return <CenteredNote text="Loading…" />
  }
  if (results === null) {
    return <CenteredNote text="Estimate not found." />
  }

  const inFlight = IN_FLIGHT.includes(results.status)
  const awaiting = results.status === "awaiting_inputs"
  const complete = results.status === "complete"
  const failed = results.status === "failed"

  async function handleSubmitInputs(values: FinancialInputValues) {
    setSubmitting(true)
    try {
      await submitInputs({ reviewId, financialInputs: values })
      toast.success("Calculating estimate…")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit financials"
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReprocess() {
    try {
      await reprocess({ reviewId })
      toast.success("Reprocessing…")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reprocess")
    }
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-3">
          <Link
            href="/audit-guard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            AuditGuard
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {results.clientName || "Premium audit estimate"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {results.policyFilenames.join(", ")}
              </p>
            </div>
          </div>
        </div>

        {failed && (
          <Card className="p-6 border-red-500/30 bg-red-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-foreground">
                    Something went wrong
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {results.errorMessage || "The policy read failed."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReprocess}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          </Card>
        )}

        {inFlight && (
          <Card className="p-10">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
              <p className="text-muted-foreground">
                {statusBlurb(results.status)}
              </p>
            </div>
          </Card>
        )}

        {/* What AuditGuard read out of the policies */}
        {(awaiting || complete) && results.lines.length > 0 && (
          <WhatWeFound lines={results.lines} />
        )}

        {/* The dynamic input checklist */}
        {awaiting && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-semibold">Enter projected financials</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Based on how these policies are rated, here&apos;s what we need.
              Enter the client&apos;s projected figures for the policy term.
            </p>
            <FinancialInputs
              requests={results.inputRequests}
              initialValues={results.financialInputs}
              submitting={submitting}
              onSubmit={handleSubmitInputs}
            />
          </Card>
        )}

        {/* The estimate */}
        {complete && results.estimateSummary && (
          <>
            <EstimateHeadline summary={results.estimateSummary} />
            <div className="space-y-3">
              {results.lines.map((line) => (
                <LineCard key={line.id} line={line} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimates only. Actual audit results depend on the carrier&apos;s
              final audit of the client&apos;s books and any class-code or rate
              changes at renewal.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function CenteredNote({ text }: { text: string }) {
  return (
    <div className="bg-muted/30 min-h-full flex items-center justify-center">
      <p className="text-muted-foreground">{text}</p>
    </div>
  )
}

function WhatWeFound({ lines }: { lines: LineResult[] }) {
  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">What we read from the policies</h2>
      <div className="space-y-2">
        {lines.map((line) => (
          <div
            key={line.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">
                {line.lineOfBusiness}
                {line.classCode ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · class {line.classCode}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {line.ratingBasisLabel}
                {line.ratePerUnit != null
                  ? ` · ${money(line.ratePerUnit)} per ${money(line.unitSize)} (${line.rateSource})`
                  : " · rate not found"}
              </p>
            </div>
            <ConfidenceBadge
              confidence={line.confidence}
              auditable={line.auditable}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}

function ConfidenceBadge({
  confidence,
  auditable,
}: {
  confidence: string
  auditable: boolean
}) {
  if (!auditable) {
    return (
      <Badge variant="secondary" className="shrink-0">
        not audited
      </Badge>
    )
  }
  const tone =
    confidence === "high"
      ? "bg-emerald-500/10 text-emerald-600"
      : confidence === "medium"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-red-500/10 text-red-600"
  return (
    <span
      className={`shrink-0 px-2 py-1 rounded-md text-xs font-medium ${tone}`}
    >
      {confidence} confidence
    </span>
  )
}

function EstimateHeadline({
  summary,
}: {
  summary: NonNullable<Results["estimateSummary"]>
}) {
  return (
    <Card className="p-6 bg-indigo-500/5 border-indigo-500/20">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-600 shrink-0">
          <TrendingUp className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Estimated additional premium at year-end audit
          </p>
          <p className="text-4xl font-bold tracking-tight text-foreground">
            ~{money(summary.totalAdditionalPremium)}
          </p>
          <p className="text-sm text-muted-foreground">
            Across {summary.estimatedLineCount} of {summary.lineCount} lines ·
            current {money(summary.totalCurrentPremium)} → projected{" "}
            {money(summary.totalProjectedPremium)}
          </p>
          {summary.floorApplied && summary.floorReasoning && (
            <p className="text-xs text-amber-600">{summary.floorReasoning}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function LineCard({ line }: { line: LineResult }) {
  const estimated = line.estimateStatus === "estimated"
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">
            {line.lineOfBusiness}
            {line.classCode ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                · class {line.classCode}
              </span>
            ) : null}
            {line.state ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {line.state}
              </span>
            ) : null}
          </h3>
          {line.annualized && (
            <Badge className="mt-1 bg-blue-500/10 text-blue-700 hover:bg-blue-500/10">
              partial-period, annualized
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">{line.ratingBasisLabel}</p>
        </div>
        {estimated ? (
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-indigo-600">
              +{money(line.additionalPremium)}
            </p>
            <p className="text-xs text-muted-foreground">est. at audit</p>
          </div>
        ) : (
          <Badge variant="secondary" className="shrink-0">
            {line.estimateStatus === "needs_input"
              ? "needs input"
              : line.estimateStatus === "insufficient_data"
                ? "data missing"
                : "not audited"}
          </Badge>
        )}
      </div>

      {estimated && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Metric label="Bound exposure" value={money(line.boundExposure)} />
          {line.annualized && (
            <Metric
              label="Entered (partial period)"
              value={money(line.rawExposure)}
            />
          )}
          <Metric
            label={line.annualized ? "Annualized projection" : "Projected"}
            value={money(line.projectedExposure)}
          />
          <Metric
            label="Rate"
            value={`${money(line.ratePerUnit)}/${money(line.unitSize)}`}
          />
          <Metric label="Current premium" value={money(line.currentPremium)} />
        </div>
      )}

      {line.estimateReasoning && (
        <p className="text-sm text-muted-foreground">{line.estimateReasoning}</p>
      )}

      {line.assumptions.length > 0 && (
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
          <p className="text-xs font-medium text-amber-700 mb-1">
            Assumptions to verify
          </p>
          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
            {line.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
