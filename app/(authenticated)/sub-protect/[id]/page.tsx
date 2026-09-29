"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Share2,
  ExternalLink,
  FileText,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

interface EvidenceCitation {
  documentName?: string
  page?: number
  excerpt: string
}

interface Finding {
  id: string
  category: string
  label: string
  priority: string
  requirementSource?:
    | "requirements_document"
    | "baseline_check"
    | "non_coi_requirement"
    | "non_contract_source"
  status: "met" | "partial" | "missing" | "needs_verification" | "not_applicable"
  requiredValue?: string
  foundValue?: string
  reasoning: string
  recommendedAction?: string
  requirementEvidenceExcerpts?: string[]
  requirementCitations?: EvidenceCitation[]
  coiEvidenceExcerpts?: string[]
  coiCitations?: EvidenceCitation[]
  evidenceExcerpts?: string[]
  sourceLinks?: { label: string; url: string }[]
}

interface Results {
  reviewId: string
  status: string
  insuredName?: string
  requirementsFilename: string
  coiFilename: string
  summaryCounts?: {
    met: number
    partial: number
    missing: number
    needsVerification: number
    notApplicable?: number
  }
  errorMessage?: string
  findings: Finding[]
}

interface DocumentUrls {
  requirements: {
    filename: string
    url: string | null
  }
  coiDocuments: Array<{
    filename: string
    url: string | null
  }>
}

interface SourceDocument {
  id: string
  side: "requirements" | "coi"
  filename: string
  label: string
  url: string | null
}

const IN_FLIGHT = ["uploaded", "parsing", "extracting", "reviewing"]

const STATUS_META: Record<
  Finding["status"],
  { label: string; icon: typeof CheckCircle2; cls: string; dot: string }
> = {
  met: { label: "Met", icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-500" },
  partial: { label: "Insufficient", icon: AlertTriangle, cls: "text-amber-600 bg-amber-500/10", dot: "bg-amber-500" },
  missing: { label: "Missing", icon: XCircle, cls: "text-red-600 bg-red-500/10", dot: "bg-red-500" },
  needs_verification: { label: "Verify", icon: HelpCircle, cls: "text-blue-600 bg-blue-500/10", dot: "bg-blue-500" },
  not_applicable: { label: "N/A", icon: HelpCircle, cls: "text-slate-600 bg-slate-500/10", dot: "bg-slate-400" },
}

const SOURCE_LABELS: Record<NonNullable<Finding["requirementSource"]>, string> = {
  requirements_document: "Requirements doc",
  baseline_check: "Baseline check",
  non_coi_requirement: "Not COI-verifiable",
  non_contract_source: "Source needs review",
}

const CERTIFICATE_MATCH_ORDER = [
  "special.policyDates",
  "special.namedInsuredMatch",
  "special.carrierPolicyLegibility",
  "special.projectMatch",
  "special.certificateHolderMatch",
  "special.attachmentsTied",
]

const CERTIFICATE_MATCH_LABELS: Record<string, string> = {
  "special.policyDates": "Certificate date / policy term",
  "special.namedInsuredMatch": "Insured",
  "special.carrierPolicyLegibility": "Insurers / policy numbers",
  "special.projectMatch": "Description of operations / project",
  "special.certificateHolderMatch": "Certificate holder",
  "special.attachmentsTied": "Attached forms",
}

const CERTIFICATE_MATCH_HELP: Record<string, string> = {
  "special.policyDates": "Top-right date and coverage effective/expiration dates",
  "special.namedInsuredMatch": "Named insured block near the top-left",
  "special.carrierPolicyLegibility": "Insurer table and policy number columns",
  "special.projectMatch": "Description of operations, project, job, and location",
  "special.certificateHolderMatch": "Certificate holder block near the bottom",
  "special.attachmentsTied": "Forms referenced by the certificate package",
}

const CERTIFICATE_MATCH_IDS = new Set(CERTIFICATE_MATCH_ORDER)

const CARRIER_RATING_CATEGORY = "Carrier Ratings"

function isCarrierRatingFinding(finding: Finding): boolean {
  return (
    finding.category === CARRIER_RATING_CATEGORY ||
    finding.id.startsWith("carrierRating.")
  )
}

function progressLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Queued for processing…"
    case "parsing":
      return "Reading both documents (OCR)…"
    case "extracting":
      return "Extracting required & actual coverage…"
    case "reviewing":
      return "Cross-examining the certificate against requirements…"
    default:
      return "Processing…"
  }
}

export default function SubProtectResultsPage() {
  const params = useParams()
  const router = useRouter()
  const reviewId = params.id as Id<"coiReviews">

  const results = useQuery(api.coiReviews.getResults, { reviewId }) as
    | Results
    | null
    | undefined
  const documentUrls = useQuery(api.coiReviews.getDocumentUrls, { reviewId }) as
    | DocumentUrls
    | null
    | undefined
  const reprocess = useMutation(api.coiReviews.reprocessReview)
  const deleteReview = useMutation(api.coiReviews.deleteReview)
  const [activeDocumentId, setActiveDocumentId] = useState("requirements")
  const [activePage, setActivePage] = useState<number | null>(null)

  const grouped = useMemo(() => {
    if (!results) return []
    const order = ["met", "partial", "missing", "needs_verification", "not_applicable"]
    const byCategory = new Map<string, Finding[]>()
    for (const f of results.findings) {
      if (CERTIFICATE_MATCH_IDS.has(f.id)) continue
      if (isCarrierRatingFinding(f)) continue
      const list = byCategory.get(f.category) ?? []
      list.push(f)
      byCategory.set(f.category, list)
    }
    return [...byCategory.entries()]
      .map(([category, findings]) => ({
        category,
        findings: findings.sort(
          (a, b) => order.indexOf(a.status) - order.indexOf(b.status)
        ),
      }))
      .filter((group) => group.findings.length > 0)
  }, [results])

  const certificateMatchFindings = useMemo(() => {
    if (!results) return []
    const byId = new Map(results.findings.map((finding) => [finding.id, finding]))
    return CERTIFICATE_MATCH_ORDER.flatMap((id) => {
      const finding = byId.get(id)
      return finding ? [finding] : []
    })
  }, [results])

  const carrierRatingFindings = useMemo(() => {
    if (!results) return []
    return results.findings.filter(isCarrierRatingFinding)
  }, [results])

  const sourceDocuments = useMemo<SourceDocument[]>(() => {
    if (!documentUrls) return []
    return [
      {
        id: "requirements",
        side: "requirements",
        filename: documentUrls.requirements.filename,
        label: "Requirements",
        url: documentUrls.requirements.url,
      },
      ...documentUrls.coiDocuments.map((doc, index) => ({
        id: `coi-${index}`,
        side: "coi" as const,
        filename: doc.filename,
        label:
          index === 0
            ? "COI"
            : doc.filename.replace(/\.pdf$/i, "") || `Attachment ${index + 1}`,
        url: doc.url,
      })),
    ]
  }, [documentUrls])

  if (results === undefined) {
    return (
      <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (results === null) {
    return (
      <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
        <div className="max-w-4xl mx-auto">
          <BackButton />
          <div className="text-center text-muted-foreground py-12">Review not found.</div>
        </div>
      </div>
    )
  }

  const inFlight = IN_FLIGHT.includes(results.status)
  const failed = results.status === "failed"

  async function handleDelete() {
    try {
      await deleteReview({ reviewId })
      toast.success("Review deleted")
      router.push("/sub-protect")
    } catch {
      toast.error("Failed to delete review")
    }
  }

  async function handleReprocess() {
    try {
      await reprocess({ reviewId })
      toast.success("Re-running verification")
    } catch {
      toast.error("Failed to reprocess")
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Review link copied")
    } catch {
      toast.error("Could not copy link")
    }
  }

  function handleViewCitation(side: "requirements" | "coi", citation: EvidenceCitation) {
    const doc = resolveCitationDocument(side, citation, documentUrls ?? null, sourceDocuments)
    if (!doc) return
    setActiveDocumentId(doc.id)
    setActivePage(citation.page ?? null)
  }

  return (
    <div className="bg-muted/30 p-4 sm:p-6 min-h-full">
      <div className="mx-auto max-w-[1800px] animate-fade-in">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(460px,46vw)]">
          <div className="min-w-0 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <BackButton />
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold tracking-tight">
                    {results.insuredName || results.coiFilename}
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">
                    {results.coiFilename} vs {results.requirementsFilename}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
                {failed && (
                  <Button variant="outline" size="sm" onClick={handleReprocess} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {inFlight && (
              <Card className="p-6 flex items-center gap-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium">{progressLabel(results.status)}</p>
                  <p className="text-sm text-muted-foreground">
                    This page updates automatically when it&apos;s done.
                  </p>
                </div>
              </Card>
            )}

            {failed && (
              <Card className="p-6 border-red-500/30 bg-red-500/5">
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-medium text-red-600">Verification failed</p>
                    <p className="text-sm text-muted-foreground">
                      {results.errorMessage || "An error occurred during processing."}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {results.status === "complete" && results.summaryCounts && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <SummaryCard label="Met" value={results.summaryCounts.met} status="met" />
                <SummaryCard label="Insufficient" value={results.summaryCounts.partial} status="partial" />
                <SummaryCard label="Missing" value={results.summaryCounts.missing} status="missing" />
                <SummaryCard label="Needs verification" value={results.summaryCounts.needsVerification} status="needs_verification" />
                <SummaryCard label="Not applicable" value={results.summaryCounts.notApplicable ?? 0} status="not_applicable" />
              </div>
            )}

            {results.status === "complete" && (
              <CertificateMatchSection
                findings={certificateMatchFindings}
                documentUrls={documentUrls ?? null}
                onViewCitation={handleViewCitation}
              />
            )}

            {results.status === "complete" && (
              <CarrierRatingsSection findings={carrierRatingFindings} />
            )}

            {grouped.map((group) => (
              <div key={group.category} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.category}
                </h2>
                <div className="space-y-2">
                  {group.findings.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      documentUrls={documentUrls ?? null}
                      onViewCitation={handleViewCitation}
                    />
                  ))}
                </div>
              </div>
            ))}

            {results.status === "complete" && results.findings.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                No requirements were extracted from the requirements document.
              </div>
            )}
          </div>

          <div className="min-w-0 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
            <SourceDocumentPanel
              documents={sourceDocuments}
              activeDocumentId={activeDocumentId}
              activePage={activePage}
              onSelectDocument={(id) => {
                setActiveDocumentId(id)
                setActivePage(null)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function BackButton() {
  return (
    <Button variant="ghost" size="icon" asChild className="rounded-xl hover:bg-muted">
      <Link href="/sub-protect">
        <ArrowLeft className="h-5 w-5" />
      </Link>
    </Button>
  )
}

function SummaryCard({
  label,
  value,
  status,
}: {
  label: string
  value: number
  status: Finding["status"]
}) {
  const meta = STATUS_META[status]
  return (
    <Card className="p-4">
      <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${meta.cls}`}>
        <meta.icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </Card>
  )
}

function CertificateMatchSection({
  findings,
  documentUrls,
  onViewCitation,
}: {
  findings: Finding[]
  documentUrls: DocumentUrls | null
  onViewCitation: (side: "requirements" | "coi", citation: EvidenceCitation) => void
}) {
  if (findings.length === 0) return null

  const problemCount = findings.filter(
    (finding) => finding.status !== "met" && finding.status !== "not_applicable"
  ).length

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Client and Certificate Match</h2>
              <p className="text-sm text-muted-foreground">
                Follows the certificate face from top to bottom.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`w-fit border-0 ${
              problemCount === 0 ? STATUS_META.met.cls : STATUS_META.missing.cls
            }`}
          >
            {problemCount === 0 ? "All matched" : `${problemCount} to fix`}
          </Badge>
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {findings.map((finding) => (
          <CertificateMatchRow
            key={finding.id}
            finding={finding}
            documentUrls={documentUrls}
            onViewCitation={onViewCitation}
          />
        ))}
      </div>
    </Card>
  )
}

function CertificateMatchRow({
  finding,
  documentUrls,
  onViewCitation,
}: {
  finding: Finding
  documentUrls: DocumentUrls | null
  onViewCitation: (side: "requirements" | "coi", citation: EvidenceCitation) => void
}) {
  const meta = STATUS_META[finding.status]
  const requirementCitation = getRequirementCitations(finding)[0]
  const coiCitation = getCoiCitations(finding)[0]

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
          <p className="font-medium">
            {CERTIFICATE_MATCH_LABELS[finding.id] ?? finding.label}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {CERTIFICATE_MATCH_HELP[finding.id] ??
            SOURCE_LABELS[finding.requirementSource ?? "baseline_check"]}
        </p>
      </div>

      <MatchValue label="Required" value={finding.requiredValue} />
      <MatchValue label="Found" value={finding.foundValue} />

      <div className="flex items-center gap-2 lg:justify-end">
        {requirementCitation &&
          resolveCitationUrl("requirements", requirementCitation, documentUrls) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2"
              onClick={() => onViewCitation("requirements", requirementCitation)}
            >
              Req
              <FileText className="h-3.5 w-3.5" />
            </Button>
          )}
        {coiCitation && resolveCitationUrl("coi", coiCitation, documentUrls) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2"
            onClick={() => onViewCitation("coi", coiCitation)}
          >
            COI
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}
        <Badge variant="outline" className={`shrink-0 border-0 ${meta.cls}`}>
          {meta.label}
        </Badge>
      </div>

      {finding.status !== "met" && (
        <div className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground lg:col-span-4">
          <span className="font-medium text-foreground">Why: </span>
          {finding.reasoning}
          {finding.recommendedAction ? (
            <>
              <span className="font-medium text-foreground"> Action: </span>
              {finding.recommendedAction}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function MatchValue({
  label,
  value,
}: {
  label: string
  value?: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm font-medium text-foreground" title={value || "—"}>
        {value || "—"}
      </p>
    </div>
  )
}

type CarrierMatch = {
  label: string
  cls: string
}

function carrierMatchIndicator(finding: Finding): CarrierMatch {
  if (finding.requiredValue === "No rating specified in contract") {
    return { label: "No requirement", cls: "text-slate-600 bg-slate-500/10" }
  }
  if ((finding.foundValue ?? "").toLowerCase().startsWith("not found")) {
    return { label: "Rating not found", cls: "text-amber-600 bg-amber-500/10" }
  }
  if (finding.priority === "high") {
    return { label: "Below required", cls: "text-red-600 bg-red-500/10" }
  }
  return { label: "Meets required", cls: "text-emerald-600 bg-emerald-500/10" }
}

function CarrierRatingsSection({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/60 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Carrier Ratings</h2>
            <p className="text-sm text-muted-foreground">
              Financial-strength ratings looked up online — always confirm manually before relying on them.
            </p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {findings.map((finding) => (
          <CarrierRatingRow key={finding.id} finding={finding} />
        ))}
      </div>
    </Card>
  )
}

function CarrierRatingRow({ finding }: { finding: Finding }) {
  const match = carrierMatchIndicator(finding)
  const verify = STATUS_META.needs_verification
  const sourceLinks = finding.sourceLinks ?? []

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="font-medium">{finding.label.replace(/ — AM Best rating$/, "")}</p>
        <p className="mt-1 text-xs text-muted-foreground">AM Best financial strength</p>
      </div>

      <MatchValue label="Required" value={finding.requiredValue} />
      <MatchValue label="Found" value={finding.foundValue} />

      <div className="flex items-center gap-2 lg:justify-end">
        <Badge variant="outline" className={`shrink-0 border-0 ${match.cls}`}>
          {match.label}
        </Badge>
        <Badge variant="outline" className={`shrink-0 border-0 ${verify.cls}`}>
          {verify.label}
        </Badge>
      </div>

      <div className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground lg:col-span-4">
        <span className="font-medium text-foreground">Why: </span>
        {finding.reasoning}
        {sourceLinks.length > 0 && (
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">Source: </span>
            {sourceLinks.map((source, i) => (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-6 items-center gap-1 rounded-md bg-background px-2 text-[11px] text-blue-600 hover:bg-muted"
              >
                {source.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function getRequirementCitations(finding: Finding): EvidenceCitation[] {
  const requirementEvidence = finding.requirementEvidenceExcerpts ?? []
  return finding.requirementCitations?.length
    ? finding.requirementCitations
    : requirementEvidence.map((excerpt) => ({ excerpt }))
}

function getCoiCitations(finding: Finding): EvidenceCitation[] {
  const coiEvidence = finding.coiEvidenceExcerpts ?? finding.evidenceExcerpts ?? []
  return finding.coiCitations?.length
    ? finding.coiCitations
    : coiEvidence.map((excerpt) => ({ excerpt }))
}

function FindingRow({
  finding,
  documentUrls,
  onViewCitation,
}: {
  finding: Finding
  documentUrls: DocumentUrls | null
  onViewCitation: (side: "requirements" | "coi", citation: EvidenceCitation) => void
}) {
  const meta = STATUS_META[finding.status]
  const sourceLabel =
    SOURCE_LABELS[finding.requirementSource ?? "requirements_document"]
  const requirementEvidence = finding.requirementEvidenceExcerpts ?? []
  const coiEvidence = finding.coiEvidenceExcerpts ?? finding.evidenceExcerpts ?? []
  const requirementCitations = getRequirementCitations(finding)
  const coiCitations = getCoiCitations(finding)
  const hasEvidence = requirementCitations.length > 0 || coiCitations.length > 0

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-2.5 w-2.5 rounded-full shrink-0 ${meta.dot}`} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{finding.label}</p>
              <p className="text-xs text-muted-foreground">{sourceLabel}</p>
            </div>
            <Badge variant="outline" className={`shrink-0 ${meta.cls} border-0`}>
              {meta.label}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              Required: <span className="text-foreground font-medium">{finding.requiredValue || "—"}</span>
            </span>
            <span className="text-muted-foreground">
              Found: <span className="text-foreground font-medium">{finding.foundValue || "—"}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{finding.reasoning}</p>
          {finding.recommendedAction && finding.status !== "met" && (
            <p className="text-sm">
              <span className="font-medium text-foreground">Action: </span>
              <span className="text-muted-foreground">{finding.recommendedAction}</span>
            </p>
          )}
          {hasEvidence && (
            <div className="grid gap-2 sm:grid-cols-2">
              <EvidenceBlock
                label="Requirement evidence"
                excerpts={requirementEvidence}
                citations={requirementCitations}
                documentUrls={documentUrls}
                side="requirements"
                onViewCitation={onViewCitation}
                emptyLabel={
                  finding.requirementSource === "baseline_check"
                    ? "Default SubProtect check"
                    : "No requirement excerpt captured"
                }
              />
              <EvidenceBlock
                label="COI evidence"
                excerpts={coiEvidence}
                citations={coiCitations}
                documentUrls={documentUrls}
                side="coi"
                onViewCitation={onViewCitation}
                emptyLabel="No COI excerpt captured"
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function EvidenceBlock({
  label,
  excerpts,
  citations,
  documentUrls,
  side,
  onViewCitation,
  emptyLabel,
}: {
  label: string
  excerpts: string[]
  citations: EvidenceCitation[]
  documentUrls: DocumentUrls | null
  side: "requirements" | "coi"
  onViewCitation: (side: "requirements" | "coi", citation: EvidenceCitation) => void
  emptyLabel: string
}) {
  const rows =
    citations.length > 0 ? citations : excerpts.map((excerpt) => ({ excerpt }))

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
        {label} ({rows.length})
      </summary>
      {rows.length > 0 ? (
        <ul className="mt-1.5 space-y-1 pl-3 border-l-2 border-border/60">
          {rows.map((citation, i) => {
            const href = resolveCitationUrl(side, citation, documentUrls)
            return (
              <li key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {formatCitationLabel(side, citation, documentUrls)}
                  </span>
                  {href && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 gap-1 text-[11px]"
                      onClick={() => onViewCitation(side, citation)}
                    >
                      View
                      <FileText className="h-3 w-3" />
                    </Button>
                  )}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="text-muted-foreground italic">
                  “{citation.excerpt}”
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-1.5 pl-3 border-l-2 border-border/60 text-muted-foreground">
          {emptyLabel}
        </p>
      )}
    </details>
  )
}

function SourceDocumentPanel({
  documents,
  activeDocumentId,
  activePage,
  onSelectDocument,
}: {
  documents: SourceDocument[]
  activeDocumentId: string
  activePage: number | null
  onSelectDocument: (id: string) => void
}) {
  const activeDocument =
    documents.find((doc) => doc.id === activeDocumentId) ?? documents[0]
  const activeUrl = activeDocument?.url
    ? `${activeDocument.url}${activePage ? `#page=${activePage}` : ""}`
    : null

  return (
    <Card className="flex h-[72vh] flex-col overflow-hidden xl:h-full">
      <div className="border-b border-border/60 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Source documents
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {activeDocument?.filename ?? "Waiting for uploaded PDFs"}
              {activePage ? ` · page ${activePage}` : ""}
            </p>
          </div>
          {activeUrl && (
            <Button variant="outline" size="sm" asChild className="shrink-0 gap-2">
              <a href={activeUrl} target="_blank" rel="noreferrer">
                Open
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {documents.length === 0 ? (
            <div className="h-8 w-40 rounded-md bg-muted" />
          ) : (
            documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelectDocument(doc.id)}
                className={`h-8 max-w-44 shrink-0 rounded-md px-3 text-xs font-medium transition-colors ${
                  doc.id === activeDocument?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
                title={doc.filename}
              >
                <span className="block truncate">{doc.label}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-background">
        {activeUrl ? (
          <iframe
            key={activeUrl}
            src={activeUrl}
            title={activeDocument?.filename ?? "Source document"}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Source PDFs will appear here when document URLs are available.
          </div>
        )}
      </div>
    </Card>
  )
}

function resolveCitationUrl(
  side: "requirements" | "coi",
  citation: EvidenceCitation,
  documentUrls: DocumentUrls | null
): string | null {
  if (!documentUrls) return null
  const pageHash = citation.page ? `#page=${citation.page}` : ""

  if (side === "requirements") {
    return documentUrls.requirements.url
      ? `${documentUrls.requirements.url}${pageHash}`
      : null
  }

  const citationName = citation.documentName?.toLowerCase() ?? ""
  const packageDocumentMatch = citationName.match(
    /coi package document\s+(\d+)/
  )
  if (packageDocumentMatch) {
    const documentIndex = Number(packageDocumentMatch[1]) - 1
    const matchedByIndex = documentUrls.coiDocuments[documentIndex]
    if (matchedByIndex?.url) return `${matchedByIndex.url}${pageHash}`
  }

  const normalizedCitationName = normalizeCitationName(citationName)
  const matched =
    documentUrls.coiDocuments.find((doc) =>
      normalizedCitationName.includes(normalizeCitationName(doc.filename)) ||
      normalizeCitationName(doc.filename).includes(normalizedCitationName)
    ) ?? documentUrls.coiDocuments[0]

  return matched?.url ? `${matched.url}${pageHash}` : null
}

function resolveCitationDocument(
  side: "requirements" | "coi",
  citation: EvidenceCitation,
  documentUrls: DocumentUrls | null,
  documents: SourceDocument[]
): SourceDocument | null {
  if (side === "requirements") {
    return documents.find((doc) => doc.id === "requirements") ?? null
  }

  if (!documentUrls) return documents.find((doc) => doc.side === "coi") ?? null

  const citationName = citation.documentName?.toLowerCase() ?? ""
  const packageDocumentMatch = citationName.match(
    /coi package document\s+(\d+)/
  )
  if (packageDocumentMatch) {
    const documentIndex = Number(packageDocumentMatch[1]) - 1
    return documents.find((doc) => doc.id === `coi-${documentIndex}`) ?? null
  }

  const normalizedCitationName = normalizeCitationName(citationName)
  return (
    documents.find(
      (doc) =>
        doc.side === "coi" &&
        (normalizedCitationName.includes(normalizeCitationName(doc.filename)) ||
          normalizeCitationName(doc.filename).includes(normalizedCitationName))
    ) ??
    documents.find((doc) => doc.side === "coi") ??
    null
  )
}

function normalizeCitationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function formatCitationLabel(
  side: "requirements" | "coi",
  citation: EvidenceCitation,
  documentUrls: DocumentUrls | null
): string {
  const fallbackName =
    side === "requirements"
      ? documentUrls?.requirements.filename ?? "Requirements"
      : citation.documentName ?? "COI package"
  const page = citation.page ? ` p. ${citation.page}` : ""
  return `${citation.documentName ?? fallbackName}${page}`
}
