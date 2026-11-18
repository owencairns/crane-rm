"use client"

import { useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import type {
  CertCheck,
  CertEdits,
  CertRequirements,
  VerifiedEvidence,
} from "@/convex/lib/certmaster/schema"
import { AgentsOnly } from "@/components/certmaster/agents-only"
import { CERT_IN_FLIGHT } from "@/components/certmaster/status"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Stamp,
  Trash2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const PdfPreview = dynamic(() => import("@/components/certmaster/pdf-preview"), { ssr: false })

export default function CertRequestPage() {
  return (
    <AgentsOnly>
      <CertRequestView />
    </AgentsOnly>
  )
}

const STEPS = [
  { key: "reading", label: "Reading the contract" },
  { key: "extracting", label: "Finding insurance requirements" },
  { key: "generating", label: "Filling the ACORD 25" },
]

function CertRequestView() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const requestId = params.id as Id<"certRequests">
  const data = useQuery(api.certRequests.get, { requestId })
  const rerun = useMutation(api.certRequests.rerun)
  const remove = useMutation(api.certRequests.remove)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (data === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }
  if (data === null) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
        <p className="text-muted-foreground">This certificate request was not found.</p>
        <Button asChild variant="outline">
          <Link href="/certmaster">Back to CertMaster</Link>
        </Button>
      </div>
    )
  }

  const req = data.requirements as CertRequirements | null
  const checks = data.checks as CertCheck[]
  const evidence = data.evidence as VerifiedEvidence[]
  const inFlight = CERT_IN_FLIGHT.includes(data.status)
  const regenerating = data.status === "generating" && !!req
  const title = data.projectName ?? data.holderName ?? data.filename

  async function handleRerun() {
    try {
      await rerun({ requestId })
      toast.success("Running again on the original file")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rerun")
    }
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <Link
              href="/certmaster"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> CertMaster
            </Link>
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 shrink-0">
                <Stamp className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
              {data.edited && <Badge variant="outline">Edited</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {[
                data.insuredName && `Insured: ${data.insuredName}`,
                data.holderName && `Holder: ${data.holderName}`,
                data.filename,
                data.pageCount && `${data.pageCount} pages`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.status === "complete" && data.pdfUrl && (
              <Button asChild className="gap-2">
                <a href={data.pdfUrl} target="_blank" rel="noreferrer" download>
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </Button>
            )}
            {data.status === "complete" && req && (
              <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit details
              </Button>
            )}
            {(data.status === "complete" || data.status === "failed") && (
              <Button variant="outline" className="gap-2" onClick={handleRerun}>
                <RefreshCw className="h-4 w-4" /> Run again
              </Button>
            )}
            {!inFlight && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {data.errorMessage && data.status === "complete" && (
          <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm text-amber-800">
            {data.errorMessage}
          </Card>
        )}

        {data.status === "failed" ? (
          <Card className="p-8 text-center space-y-3">
            <XCircle className="h-8 w-8 mx-auto text-red-600" />
            <h2 className="font-semibold">Could not draft this certificate</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              {data.errorMessage ?? "Something went wrong."}
            </p>
            <Button onClick={handleRerun} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </Card>
        ) : inFlight && !regenerating ? (
          <Progress status={data.status} />
        ) : req ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-start">
            <Card className="overflow-hidden p-0 lg:sticky lg:top-4">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-sm font-medium">Example ACORD 25</span>
                {regenerating ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                  </span>
                ) : (
                  data.pdfUrl && (
                    <a
                      href={data.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )
                )}
              </div>
              {data.pdfUrl ? (
                <div className="max-h-[80vh] overflow-y-auto bg-white">
                  <PdfPreview key={data.pdfUrl} url={data.pdfUrl} />
                </div>
              ) : (
                <div className="h-96 flex items-center justify-center text-sm text-muted-foreground">
                  No PDF yet
                </div>
              )}
            </Card>

            <div className="space-y-6">
              <ChecksCard checks={checks} />
              <WordingCard remarks={data.remarks ?? ""} />
              <MinimumsCard req={req} evidence={evidence} />
              <p className="text-xs text-muted-foreground">
                Source:{" "}
                {data.sourceUrl ? (
                  <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                    {data.filename}
                  </a>
                ) : (
                  data.filename
                )}
                {data.durationMs ? ` · drafted in ${Math.round(data.durationMs / 1000)}s` : ""}
                {data.model ? ` · ${data.model}` : ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {req && editOpen && (
        <EditDialog
          requestId={requestId}
          req={req}
          edited={data.edited}
          onClose={() => setEditOpen(false)}
        />
      )}
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this certificate?"
        description="The uploaded contract and the example PDF are deleted for good."
        confirmText="Delete"
        variant="destructive"
        onConfirm={async () => {
          await remove({ requestId })
          router.push("/certmaster")
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Progress({ status }: { status: string }) {
  const current = STEPS.findIndex((s) => s.key === status)
  return (
    <Card className="p-8">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h2 className="font-semibold">Drafting the example certificate</h2>
          <p className="text-sm text-muted-foreground">Usually about 30 seconds. You can leave this page.</p>
        </div>
        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const done = current > i
            const active = current === i || (current === -1 && i === 0)
            return (
              <li key={step.key} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border",
                    done && "bg-emerald-500 border-emerald-500 text-white",
                    active && "border-primary text-primary",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                  )}
                </span>
                <span className={cn(!done && !active && "text-muted-foreground")}>{step.label}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

const SEVERITY = {
  error: { icon: XCircle, tone: "text-red-600", label: "Fix before sending" },
  warning: { icon: AlertTriangle, tone: "text-amber-600", label: "Check" },
  info: { icon: Info, tone: "text-sky-600", label: "Note" },
} as const

function ChecksCard({ checks }: { checks: CertCheck[] }) {
  const [showNotes, setShowNotes] = useState(false)
  const important = checks.filter((c) => c.severity !== "info")
  const notes = checks.filter((c) => c.severity === "info")
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Before you issue the real certificate</h2>
        {important.length === 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nothing blocking
          </span>
        )}
      </div>
      <ul className="space-y-3">
        {important.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
      {notes.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showNotes ? "Hide" : "Show"} {notes.length} contract note{notes.length === 1 ? "" : "s"}
          </button>
          {showNotes && (
            <ul className="space-y-3">
              {notes.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function CheckRow({ check }: { check: CertCheck }) {
  const s = SEVERITY[check.severity]
  const Icon = s.icon
  return (
    <li className="flex gap-3">
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", s.tone)} aria-label={s.label} />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{check.title}</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">{check.detail}</p>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */

function WordingCard({ remarks }: { remarks: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(remarks)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Description of operations</h2>
          <p className="text-xs text-muted-foreground">Red Cedar standard wording, ready to paste.</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={copy} disabled={!remarks}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="rounded-lg border bg-muted/40 p-4 text-[13px] leading-relaxed whitespace-pre-wrap">
        {remarks || "No wording needed."}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? null : `$${n.toLocaleString("en-US")}`

type Row = { label: string; value: string | null }

function Flags({ items }: { items: Array<[string, boolean]> }) {
  const on = items.filter(([, v]) => v)
  if (on.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {on.map(([label]) => (
        <Badge key={label} variant="secondary" className="font-normal">
          {label}
        </Badge>
      ))}
    </div>
  )
}

function MinimumsCard({ req, evidence }: { req: CertRequirements; evidence: VerifiedEvidence[] }) {
  const c = req.coverages
  const pnc = new Set(req.endorsements.primaryNoncontributoryLines)
  const s = req.descriptionOfOperations.structured

  const sections: Array<{
    key: string
    title: string
    required: boolean
    rows: Row[]
    flags: Array<[string, boolean]>
    evidenceKey: string
  }> = [
    {
      key: "gl",
      title: "General Liability",
      required: c.generalLiability.required,
      evidenceKey: "General Liability",
      rows: [
        { label: "Each occurrence", value: money(c.generalLiability.limits.eachOccurrence) },
        {
          label: `General aggregate${c.generalLiability.genAggregateAppliesPer ? ` (per ${c.generalLiability.genAggregateAppliesPer})` : ""}`,
          value: money(c.generalLiability.limits.generalAggregate),
        },
        { label: "Products / completed ops", value: money(c.generalLiability.limits.productsCompletedOpsAggregate) },
        { label: "Personal & advertising", value: money(c.generalLiability.limits.personalAdvertisingInjury) },
        { label: "Damage to rented premises", value: money(c.generalLiability.limits.damageToRentedPremises) },
        { label: "Medical expense", value: money(c.generalLiability.limits.medicalExpense) },
      ],
      flags: [
        [c.generalLiability.formType === "claimsMade" ? "Claims-made" : "Occurrence", true],
        ["Additional insured", c.generalLiability.addlInsured],
        ["Completed ops AI", s.additionalInsured.scope === "both" || s.additionalInsured.scope === "completedOperations"],
        ["Waiver of subrogation", c.generalLiability.subrogationWaived],
        ["Primary & non-contributory", pnc.has("generalLiability")],
      ],
    },
    {
      key: "auto",
      title: "Automobile Liability",
      required: c.autoLiability.required,
      evidenceKey: "Automobile Liability",
      rows: [
        { label: "Combined single limit", value: money(c.autoLiability.limits.combinedSingleLimit) },
        { label: "Bodily injury per person", value: money(c.autoLiability.limits.bodilyInjuryPerPerson) },
        { label: "Bodily injury per accident", value: money(c.autoLiability.limits.bodilyInjuryPerAccident) },
        { label: "Property damage", value: money(c.autoLiability.limits.propertyDamagePerAccident) },
      ],
      flags: [
        ["Any auto", c.autoLiability.coverageSymbols.anyAuto],
        ["Owned", !c.autoLiability.coverageSymbols.anyAuto && c.autoLiability.coverageSymbols.ownedAutosOnly],
        ["Hired", !c.autoLiability.coverageSymbols.anyAuto && c.autoLiability.coverageSymbols.hiredAutosOnly],
        ["Non-owned", !c.autoLiability.coverageSymbols.anyAuto && c.autoLiability.coverageSymbols.nonOwnedAutosOnly],
        ["Additional insured", c.autoLiability.addlInsured],
        ["Waiver of subrogation", c.autoLiability.subrogationWaived],
        ["Primary & non-contributory", pnc.has("autoLiability")],
      ],
    },
    {
      key: "umbrella",
      title: c.umbrellaExcess.type === "excess" ? "Excess Liability" : "Umbrella Liability",
      required: c.umbrellaExcess.required,
      evidenceKey: "Umbrella / Excess",
      rows: [
        { label: "Each occurrence", value: money(c.umbrellaExcess.limits.eachOccurrence) },
        { label: "Aggregate", value: money(c.umbrellaExcess.limits.aggregate) },
      ],
      flags: [
        ["Additional insured", c.umbrellaExcess.addlInsured],
        ["Waiver of subrogation", c.umbrellaExcess.subrogationWaived],
      ],
    },
    {
      key: "wc",
      title: "Workers Compensation / EL",
      required: c.workersComp.required,
      evidenceKey: "Workers Compensation",
      rows: [
        { label: "EL each accident", value: money(c.workersComp.employersLiability.eachAccident) },
        { label: "EL disease, each employee", value: money(c.workersComp.employersLiability.diseaseEachEmployee) },
        { label: "EL disease, policy limit", value: money(c.workersComp.employersLiability.diseasePolicyLimit) },
      ],
      flags: [
        ["Statutory", c.workersComp.wcStatutory],
        ["Waiver of subrogation", c.workersComp.subrogationWaived],
      ],
    },
    ...c.other
      .filter((o) => o.required)
      .map((o, i) => ({
        key: `other-${i}`,
        title: o.coverageName,
        required: true,
        evidenceKey: o.coverageName,
        rows: o.limits.map((l) => ({ label: l.label, value: money(l.amount) })),
        flags: [
          ["Additional insured", o.addlInsured],
          ["Waiver of subrogation", o.subrogationWaived],
        ] as Array<[string, boolean]>,
      })),
  ]

  const required = sections.filter((x) => x.required)
  const notRequired = sections.filter((x) => !x.required)

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="font-semibold">Minimum coverage the contract requires</h2>
        <p className="text-xs text-muted-foreground">
          Every amount is a floor. Show the client&apos;s actual limits if they are higher.
        </p>
      </div>
      <div className="divide-y">
        {required.map((sec) => {
          const ev = evidence.filter((e) => e.section === sec.evidenceKey)
          const rows = sec.rows.filter((r) => r.value)
          return (
            <section key={sec.key} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
              <h3 className="text-sm font-semibold">{sec.title}</h3>
              {rows.length > 0 ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  {rows.map((r) => (
                    <div key={r.label} className="contents">
                      <dt className="text-muted-foreground">{r.label}</dt>
                      <dd className="font-medium tabular-nums text-right">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No minimum limit stated.</p>
              )}
              <Flags items={sec.flags} />
              {ev.length > 0 && <EvidenceList items={ev} />}
            </section>
          )
        })}
      </div>
      {notRequired.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not required by this contract: {notRequired.map((x) => x.title).join(", ")}.
        </p>
      )}
    </Card>
  )
}

function EvidenceList({ items }: { items: VerifiedEvidence[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-primary hover:underline"
      >
        {open ? "Hide" : "Show"} where this comes from ({items.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {items.map((e, i) => (
            <li key={i} className="rounded-md border-l-2 border-rose-300 bg-muted/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium text-foreground">p. {e.page}</span>
                {!e.verified && (
                  <span className="text-amber-600">quote not found on this page, double-check</span>
                )}
              </div>
              <p className="mt-0.5 leading-relaxed">
                &ldquo;{e.excerpt.replace(/\*\*/g, "").replace(/\s*\|\s*/g, " ").trim()}&rdquo;
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function formatAddress(a: CertRequirements["namedInsured"]["address"]) {
  const cityLine = [a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .filter((p) => p && p.trim())
    .join(", ")
  return [a.line1, a.line2, cityLine].filter((p) => p && p.trim()).join(", ")
}

function EditDialog({
  requestId,
  req,
  edited,
  onClose,
}: {
  requestId: Id<"certRequests">
  req: CertRequirements
  edited: boolean
  onClose: () => void
}) {
  const saveEdits = useMutation(api.certRequests.saveEdits)
  const resetEdits = useMutation(api.certRequests.resetEdits)
  const [form, setForm] = useState<CertEdits>({
    namedInsuredName: req.namedInsured.name,
    namedInsuredAddress: formatAddress(req.namedInsured.address) || null,
    certificateHolderName: req.certificateHolder.name,
    certificateHolderAddress: formatAddress(req.certificateHolder.address) || null,
    projectName: req.descriptionOfOperations.structured.projectName ?? req.contractInfo.projectName,
    jobNumber: req.descriptionOfOperations.structured.jobNumber,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof CertEdits) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    setSaving(true)
    try {
      await saveEdits({ requestId, edits: form })
      toast.success("Updating the certificate")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
      setSaving(false)
    }
  }

  const field = (k: keyof CertEdits, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k] ?? ""} onChange={set(k)} placeholder={placeholder} />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit certificate details</DialogTitle>
          <DialogDescription>
            Fix names or addresses the contract got wrong or left out. Coverage minimums stay as the
            contract states them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {field("namedInsuredName", "Named insured")}
          {field("namedInsuredAddress", "Insured address", "Street, City, ST 12345")}
          {field("certificateHolderName", "Certificate holder")}
          {field("certificateHolderAddress", "Holder address", "Street, City, ST 12345")}
          <div className="grid grid-cols-2 gap-4">
            {field("projectName", "Project")}
            {field("jobNumber", "Job #")}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {edited ? (
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={async () => {
                await resetEdits({ requestId })
                toast.success("Back to what the contract says")
                onClose()
              }}
            >
              <RotateCcw className="h-4 w-4" /> Reset to contract
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save and update PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
