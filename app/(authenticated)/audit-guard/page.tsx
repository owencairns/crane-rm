"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { MultiFileDrop } from "@/components/subprotect/file-drop"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Calculator,
  Loader2,
  CheckCircle2,
  XCircle,
  ClipboardList,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"

interface ReviewListItem {
  id: string
  clientName: string
  policyFilename: string
  status: string
  date: string
  estimateSummary?: {
    lineCount: number
    estimatedLineCount: number
    totalCurrentPremium: number | null
    totalProjectedPremium: number | null
    totalAdditionalPremium: number | null
  }
}

const IN_FLIGHT = ["uploaded", "parsing", "extracting", "estimating"]

function statusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Queued"
    case "parsing":
      return "Reading policies…"
    case "extracting":
      return "Mapping rating bases…"
    case "awaiting_inputs":
      return "Needs financials"
    case "estimating":
      return "Calculating…"
    case "complete":
      return "Complete"
    case "failed":
      return "Failed"
    default:
      return status
  }
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export default function AuditGuardPage() {
  const router = useRouter()
  const reviewsQuery = useQuery(api.auditGuardReviews.list)
  const requestReview = useMutation(api.auditGuardReviews.requestReview)
  const startReview = useMutation(api.auditGuardReviews.startReview)

  const [policyFiles, setPolicyFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const reviews = (reviewsQuery ?? []) as ReviewListItem[]
  const canSubmit = policyFiles.length > 0 && !submitting

  async function uploadTo(url: string, file: File): Promise<Id<"_storage">> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/pdf" },
      body: file,
    })
    if (!res.ok) throw new Error("Failed to upload file")
    const { storageId } = await res.json()
    return storageId as Id<"_storage">
  }

  async function handleRun() {
    if (policyFiles.length === 0) return
    setSubmitting(true)
    try {
      const { reviewId, policyUploadUrls } = await requestReview({
        policyFilenames: policyFiles.map((file) => file.name),
      })

      const policyStorageIds = await Promise.all(
        policyFiles.map((file, index) => uploadTo(policyUploadUrls[index], file))
      )

      await startReview({
        reviewId: reviewId as Id<"auditGuardReviews">,
        policyStorageIds,
      })

      toast.success("Reading policies…")
      router.push(`/audit-guard/${reviewId}`)
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : "Failed to start AuditGuard"
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Calculator className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              AuditGuard
            </h1>
          </div>
          <p className="text-muted-foreground">
            Drop in a client&apos;s in-force policies. AuditGuard reads how each
            line of business is rated, tells you exactly which financials to
            enter, and projects the additional premium to expect at year-end
            audit.
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <MultiFileDrop
            label="Policy package"
            hint="Declarations, coverage schedules, and endorsements (GL, WC, auto, umbrella)"
            files={policyFiles}
            onSelect={setPolicyFiles}
            disabled={submitting}
          />
          <div className="flex justify-end">
            <Button onClick={handleRun} disabled={!canSubmit} className="gap-2">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              Read Policies
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">History</h2>
            <Badge variant="secondary">{reviews.length}</Badge>
          </div>

          {reviewsQuery === undefined ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : reviews.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No estimates yet. Upload a client&apos;s policies to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => {
                const inFlight = IN_FLIGHT.includes(review.status)
                const awaiting = review.status === "awaiting_inputs"
                const failed = review.status === "failed"
                return (
                  <Link
                    key={review.id}
                    href={`/audit-guard/${review.id}`}
                    className="block"
                  >
                    <Card className="p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              failed
                                ? "bg-red-500/10 text-red-600"
                                : awaiting
                                  ? "bg-amber-500/10 text-amber-600"
                                  : inFlight
                                    ? "bg-blue-500/10 text-blue-600"
                                    : "bg-emerald-500/10 text-emerald-600"
                            }`}
                          >
                            {failed ? (
                              <XCircle className="h-5 w-5" />
                            ) : awaiting ? (
                              <ClipboardList className="h-5 w-5" />
                            ) : inFlight ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">
                              {review.clientName}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {review.policyFilename} · {review.date}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {review.status === "complete" &&
                          review.estimateSummary ? (
                            <span className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-600 font-medium text-xs">
                              ~{money(review.estimateSummary.totalAdditionalPremium)}{" "}
                              est. at audit
                            </span>
                          ) : (
                            <Badge variant={failed ? "destructive" : "secondary"}>
                              {statusLabel(review.status)}
                            </Badge>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
