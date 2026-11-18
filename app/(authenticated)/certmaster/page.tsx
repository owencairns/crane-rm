"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { FileDrop } from "@/components/subprotect/file-drop"
import { AgentsOnly } from "@/components/certmaster/agents-only"
import { certStatusLabel, CERT_IN_FLIGHT } from "@/components/certmaster/status"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Stamp, Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react"
import { toast } from "sonner"

function formatDate(ts: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(ts),
  )
}

export default function CertMasterPage() {
  return (
    <AgentsOnly>
      <CertMasterHome />
    </AgentsOnly>
  )
}

function CertMasterHome() {
  const router = useRouter()
  const requests = useQuery(api.certRequests.list)
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
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
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

        <Card className="p-6 space-y-5">
          <FileDrop
            label="Contract or insurance requirements"
            hint="PDF, scanned or digital. Long contracts are fine."
            file={file}
            onSelect={setFile}
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Takes about 30 seconds. Nothing is sent to the certificate holder.
            </p>
            <Button onClick={handleRun} disabled={!file || submitting} className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
              Draft example certificate
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Recent certificates</h2>
            {requests && <Badge variant="secondary">{requests.length}</Badge>}
          </div>

          {requests === undefined ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Nothing yet. Upload a contract to draft your first example certificate.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => {
                const inFlight = CERT_IN_FLIGHT.includes(r.status)
                const failed = r.status === "failed"
                return (
                  <Link key={r.id} href={`/certmaster/${r.id}`} className="block">
                    <Card className="p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              failed
                                ? "bg-red-500/10 text-red-600"
                                : inFlight
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-rose-500/10 text-rose-600"
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
                            <h3 className="font-semibold truncate">
                              {r.projectName ?? r.holderName ?? r.filename}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {[r.insuredName, r.holderName && `for ${r.holderName}`, formatDate(r.createdAt)]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {r.status === "complete" ? (
                            <div className="hidden sm:flex items-center gap-2 text-xs">
                              {r.errorCount > 0 && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-600 font-medium">
                                  <XCircle className="h-3 w-3" />
                                  {r.errorCount} to fix
                                </span>
                              )}
                              {r.warningCount > 0 && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 font-medium">
                                  <AlertTriangle className="h-3 w-3" />
                                  {r.warningCount} to check
                                </span>
                              )}
                              {r.errorCount === 0 && r.warningCount === 0 && (
                                <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 font-medium">
                                  Ready
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant={failed ? "destructive" : "secondary"}>
                              {certStatusLabel(r.status)}
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
