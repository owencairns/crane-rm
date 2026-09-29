"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { FileDrop, MultiFileDrop } from "@/components/subprotect/file-drop"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"

interface ReviewListItem {
  id: string
  insuredName: string
  requirementsFilename: string
  coiFilename: string
  status: string
  date: string
  summaryCounts?: {
    met: number
    partial: number
    missing: number
    needsVerification: number
    notApplicable?: number
  }
}

const IN_FLIGHT = ["uploaded", "parsing", "extracting", "reviewing"]

function statusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Queued"
    case "parsing":
      return "Reading documents…"
    case "extracting":
      return "Extracting coverage…"
    case "reviewing":
      return "Cross-examining…"
    case "complete":
      return "Complete"
    case "failed":
      return "Failed"
    default:
      return status
  }
}

export default function SubProtectPage() {
  const router = useRouter()
  const reviewsQuery = useQuery(api.coiReviews.list)
  const requestReview = useMutation(api.coiReviews.requestReview)
  const startReview = useMutation(api.coiReviews.startReview)

  const [requirementsFile, setRequirementsFile] = useState<File | null>(null)
  const [coiFiles, setCoiFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const reviews = (reviewsQuery ?? []) as ReviewListItem[]
  const canSubmit = !!requirementsFile && coiFiles.length > 0 && !submitting

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
    if (!requirementsFile || coiFiles.length === 0) return
    setSubmitting(true)
    try {
      const { reviewId, requirementsUploadUrl, coiUploadUrls } = await requestReview({
        requirementsFilename: requirementsFile.name,
        coiFilenames: coiFiles.map((file) => file.name),
      })

      const [requirementsStorageId, coiStorageIds] = await Promise.all([
        uploadTo(requirementsUploadUrl, requirementsFile),
        Promise.all(
          coiFiles.map((file, index) => uploadTo(coiUploadUrls[index], file))
        ),
      ])

      await startReview({
        reviewId: reviewId as Id<"coiReviews">,
        requirementsStorageId,
        coiStorageIds,
      })

      toast.success("Verification started")
      router.push(`/sub-protect/${reviewId}`)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to start verification")
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">SubProtect</h1>
          </div>
          <p className="text-muted-foreground">
            Drop in a certificate package and the requirements it must satisfy. We&apos;ll
            cross-examine every limit, date, and attached endorsement and flag anything that falls short.
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FileDrop
              label="1. Insurance requirements"
              hint="The contract or exhibit describing required coverage"
              file={requirementsFile}
              onSelect={setRequirementsFile}
              disabled={submitting}
            />
            <MultiFileDrop
              label="2. Certificate package"
              hint="COI plus attached GL/auto endorsements, schedules, or forms"
              files={coiFiles}
              onSelect={setCoiFiles}
              disabled={submitting}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleRun} disabled={!canSubmit} className="gap-2">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Run Verification
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
              No verifications yet. Upload a COI and its requirements to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => {
                const inFlight = IN_FLIGHT.includes(review.status)
                const failed = review.status === "failed"
                return (
                  <Link key={review.id} href={`/sub-protect/${review.id}`} className="block">
                    <Card className="p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              failed
                                ? "bg-red-500/10 text-red-600"
                                : inFlight
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-emerald-500/10 text-emerald-600"
                            }`}
                          >
                            {failed ? (
                              <XCircle className="h-5 w-5" />
                            ) : inFlight ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">{review.insuredName}</h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {review.coiFilename} · {review.date}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {review.status === "complete" && review.summaryCounts ? (
                            <SummaryChips counts={review.summaryCounts} />
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

function SummaryChips({
  counts,
}: {
  counts: {
    met: number
    partial: number
    missing: number
    needsVerification: number
    notApplicable?: number
  }
}) {
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs">
      {counts.missing > 0 && (
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-600 font-medium">
          <XCircle className="h-3 w-3" />
          {counts.missing} missing
        </span>
      )}
      {counts.partial > 0 && (
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 font-medium">
          <AlertTriangle className="h-3 w-3" />
          {counts.partial} short
        </span>
      )}
      {counts.needsVerification > 0 && (
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 font-medium">
          {counts.needsVerification} verify
        </span>
      )}
      {(counts.notApplicable ?? 0) > 0 && (
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-500/10 text-slate-600 font-medium">
          {counts.notApplicable} n/a
        </span>
      )}
      <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 font-medium">
        <CheckCircle2 className="h-3 w-3" />
        {counts.met} met
      </span>
    </div>
  )
}
