"use client"

import { useQuery } from "convex/react"
import { useParams } from "next/navigation"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const
const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

const priorityClass: Record<string, string> = {
  critical: "text-red-700 border-red-300",
  high: "text-orange-700 border-orange-300",
  medium: "text-amber-700 border-amber-300",
  low: "text-slate-600 border-slate-300",
}

export default function ReportPage() {
  const params = useParams()
  const contractId = params.id as Id<"contracts">

  const contract = useQuery(api.contracts.get, { contractId })
  const results = useQuery(api.contracts.getResults, { contractId })

  const loading = contract === undefined || results === undefined

  const matched = results?.findings.filter((f) => f.matched) ?? []
  const byPriority = PRIORITY_ORDER.map((p) => ({
    priority: p,
    findings: matched.filter((f) => f.priority === p),
  })).filter((g) => g.findings.length > 0)

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!contract || !results) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <p className="text-muted-foreground">Report unavailable.</p>
      </div>
    )
  }

  return (
    <div className="bg-white text-slate-900 min-h-screen print:bg-white">
      {/* Action bar — hidden on print */}
      <div className="print:hidden border-b border-border/60 bg-card/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <Link href={`/contracts/${contractId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to analysis
            </Link>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Report body */}
      <article className="max-w-3xl mx-auto px-8 py-10 print:px-0 print:py-6">
        <header className="border-b border-slate-200 pb-6 mb-8">
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-xl tracking-tight">Redline</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Contract Review
              </span>
            </div>
            <span className="text-xs text-slate-500">
              by Red Cedar Insurance Agency
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            {contract.name}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Reviewed {contract.date}</span>
            {contract.client && contract.client !== "Unknown Client" && (
              <span>GC: {contract.client}</span>
            )}
            {contract.projectName && <span>Project: {contract.projectName}</span>}
            {contract.state && <span>State: {contract.state}</span>}
            <span>{matched.length} provisions flagged</span>
          </div>
        </header>

        {results.summary && (
          <section className="mb-8">
            <h2 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              Executive Summary
            </h2>
            <p className="text-sm leading-relaxed text-slate-800">{results.summary}</p>
          </section>
        )}

        {byPriority.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No provisions of concern were flagged during this review.
          </p>
        ) : (
          byPriority.map(({ priority, findings }) => (
            <section key={priority} className="mb-8 break-inside-avoid">
              <h2
                className={`text-sm uppercase tracking-wider font-semibold mb-3 pb-1 border-b ${priorityClass[priority]}`}
              >
                {PRIORITY_LABELS[priority]} · {findings.length}
              </h2>
              <div className="space-y-5">
                {findings.map((f) => (
                  <div key={f.id} className="break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <h3 className="font-semibold text-base text-slate-900">{f.title}</h3>
                      {f.pageReferences && f.pageReferences.length > 0 && (
                        <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                          p. {f.pageReferences.join(", ")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2">
                      {f.description}
                    </p>
                    {f.evidenceExcerpts && f.evidenceExcerpts.length > 0 && (
                      <div className="border-l-2 border-slate-300 pl-3 mb-2 space-y-1">
                        {f.evidenceExcerpts.slice(0, 2).map((excerpt, i) => (
                          <p key={i} className="text-xs italic text-slate-600">
                            &ldquo;{excerpt}&rdquo;
                          </p>
                        ))}
                      </div>
                    )}
                    {f.recommendation && (
                      <div className="mt-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                          Redline Recommendation
                        </span>
                        <p className="text-sm text-slate-800 mt-0.5">{f.recommendation}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        <footer className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
          <p className="mb-2">
            <strong>Legal disclaimer:</strong> This report is generated by an AI-assisted
            contract review tool. The terms highlighted are recommendations to negotiate and
            discuss with your attorney. This is not a substitute for professional legal counsel.
          </p>
          <p>Redline by Red Cedar Insurance Agency.</p>
        </footer>
      </article>
    </div>
  )
}
