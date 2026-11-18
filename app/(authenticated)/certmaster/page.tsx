"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { FileDrop } from "@/components/subprotect/file-drop"
import { AgentsOnly } from "@/components/certmaster/agents-only"
import { certStatusLabel, CERT_IN_FLIGHT, MINUTES_SAVED_PER_CERT } from "@/components/certmaster/status"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Stamp,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Search,
  Archive,
  FileWarning,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Row = FunctionReturnType<typeof api.certRequests.list>[number]

const DAY = 86_400_000

function formatDate(ts: number) {
  const d = new Date(ts)
  const sameDay = new Date().toDateString() === d.toDateString()
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function CertMasterPage() {
  return (
    <AgentsOnly>
      <CertMasterHome />
    </AgentsOnly>
  )
}

function CertMasterHome() {
  const [showArchived, setShowArchived] = useState(false)
  const [scope, setScope] = useState<"all" | "mine">("all")
  const [search, setSearch] = useState("")
  const rows = useQuery(api.certRequests.list, { includeArchived: showArchived })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (scope === "mine" && !r.mine) return false
      if (!q) return true
      return [r.projectName, r.holderName, r.insuredName, r.filename, r.uploadedBy]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [rows, scope, search])

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
              <Stamp className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">CertMaster</h1>
            <Badge variant="outline" className="font-normal">For agents</Badge>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Upload a contract, subcontract, or insurance exhibit. CertMaster finds the minimum
            coverage it demands and drafts an example ACORD 25 with the limits, checkboxes, and
            description of operations wording, plus what to check before you issue the real one.
          </p>
        </div>

        <UploadCard />

        <Stats rows={rows?.filter((r) => !r.archived)} />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Agency queue</h2>
              {rows && <Badge variant="secondary">{filtered.length}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project, holder, insured…"
                  className="h-9 w-64 pl-8"
                  aria-label="Search certificates"
                />
              </div>
              <div className="flex rounded-lg border bg-background p-0.5 text-sm" role="tablist">
                {(["all", "mine"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={scope === s}
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-md px-3 py-1 transition-colors",
                      scope === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "all" ? "Everyone" : "Mine"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="accent-rose-600"
                />
                Archived
              </label>
            </div>
          </div>

          {rows === undefined ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : filtered.length === 0 ? (
            <Card className="py-12 text-center text-muted-foreground">
              {rows.length === 0
                ? "Nothing yet. Upload a contract to draft the first example certificate."
                : "No certificates match."}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_11rem_4.5rem] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Project / holder</span>
                <span>Insured</span>
                <span>Account manager</span>
                <span className="text-right">Status</span>
                <span className="text-right">Date</span>
              </div>
              <ul className="divide-y">
                {filtered.map((r) => (
                  <QueueRow key={r.id} row={r} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

function UploadCard() {
  const router = useRouter()
  const requestUpload = useMutation(api.certRequests.requestUpload)
  const start = useMutation(api.certRequests.start)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleRun() {
    if (!file) return
    setSubmitting(true)
    try {
      const { requestId, uploadUrl } = await requestUpload({ filename: file.name })
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      })
      if (!res.ok) throw new Error("Upload failed")
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
      await start({ requestId, storageId })
      router.push(`/certmaster/${requestId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start")
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-6 space-y-5">
      <FileDrop
        label="Contract or insurance requirements"
        hint="PDF, scanned or digital. Long contracts are fine."
        file={file}
        onSelect={setFile}
        disabled={submitting}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          About 30 seconds. Nothing is sent to the certificate holder.
        </p>
        <Button onClick={handleRun} disabled={!file || submitting} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
          Draft example certificate
        </Button>
      </div>
    </Card>
  )
}

function Stats({ rows }: { rows: Row[] | undefined }) {
  const [now] = useState(() => Date.now())
  const stats = useMemo(() => {
    const recent = (rows ?? []).filter((r) => r.createdAt >= now - 30 * DAY)
    const done = recent.filter((r) => r.status === "complete")
    const failed = recent.filter((r) => r.status === "failed")
    const finished = done.length + failed.length
    const durations = done
      .map((r) => r.durationMs)
      .filter((d): d is number => typeof d === "number")
      .sort((a, b) => a - b)
    const median = durations.length ? durations[Math.floor(durations.length / 2)] : null
    const needsAttention = (rows ?? []).filter(
      (r) => r.status === "failed" || (r.status === "complete" && r.errorCount > 0),
    ).length
    const allDone = (rows ?? []).filter((r) => r.status === "complete").length
    return {
      drafted: done.length,
      successRate: finished ? Math.round((done.length / finished) * 100) : null,
      median,
      needsAttention,
      hoursSaved: (done.length * MINUTES_SAVED_PER_CERT) / 60,
      allHoursSaved: (allDone * MINUTES_SAVED_PER_CERT) / 60,
    }
  }, [rows, now])

  const tiles = [
    { label: "Drafted, last 30 days", value: rows ? String(stats.drafted) : "…" },
    {
      label: "Success rate",
      value: stats.successRate === null ? "—" : `${stats.successRate}%`,
    },
    { label: "Median time", value: stats.median === null ? "—" : formatDuration(stats.median) },
    {
      label: "Needs attention",
      value: rows ? String(stats.needsAttention) : "…",
      tone: stats.needsAttention > 0 ? "text-amber-600" : undefined,
    },
    {
      label: "Agent time saved",
      value: `${stats.hoursSaved.toFixed(1)} h`,
      sub: `${stats.allHoursSaved.toFixed(1)} h all time · est. ${MINUTES_SAVED_PER_CERT} min per cert`,
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label} className="p-4">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", t.tone)}>{t.value}</p>
          {t.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{t.sub}</p>}
        </Card>
      ))}
    </div>
  )
}

function QueueRow({ row: r }: { row: Row }) {
  const inFlight = CERT_IN_FLIGHT.includes(r.status)
  const failed = r.status === "failed"
  return (
    <li>
      <Link
        href={`/certmaster/${r.id}`}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_11rem_4.5rem] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40 transition-colors",
          r.archived && "opacity-60",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
              failed ? "bg-red-500/10 text-red-600" : inFlight ? "bg-blue-500/10 text-blue-600" : "bg-rose-500/10 text-rose-600",
            )}
          >
            {failed ? (
              <XCircle className="h-4 w-4" />
            ) : inFlight ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : r.docKind === "issuedCoi" ? (
              <FileWarning className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">
              {r.projectName ?? r.holderName ?? r.filename}
              {r.archived && <Archive className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground" />}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {r.projectName && r.holderName ? `For ${r.holderName}` : r.filename}
            </p>
          </div>
        </div>
        <p className="hidden md:block text-sm truncate">{r.insuredName ?? <span className="text-muted-foreground">Not named</span>}</p>
        <p className="hidden md:block text-sm text-muted-foreground truncate">
          {r.mine ? "You" : r.uploadedBy ?? "Unknown"}
        </p>
        <div className="flex items-center justify-end gap-2 text-xs">
          {r.status === "complete" ? (
            <>
              {r.errorCount > 0 && (
                <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 font-medium text-red-600">
                  <XCircle className="h-3 w-3" />
                  {r.errorCount} to fix
                </span>
              )}
              {r.warningCount > 0 && (
                <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 font-medium text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {r.warningCount} to check
                </span>
              )}
              {r.errorCount === 0 && r.warningCount === 0 && (
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600">Ready</span>
              )}
            </>
          ) : (
            <Badge variant={failed ? "destructive" : "secondary"}>{certStatusLabel(r.status)}</Badge>
          )}
        </div>
        <div className="hidden md:flex items-center justify-end gap-1 text-xs text-muted-foreground">
          {formatDate(r.createdAt)}
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </Link>
    </li>
  )
}
