"use client"

import { useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { InteractiveViewer } from "@/components/analysis/interactive-viewer"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Share2, Download, MoreVertical } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalysisResult, Finding } from "@/components/contracts/analysis-viewer"
import { api } from "@/convex/_generated/api"

export default function AnalysisPage() {
  const params = useParams()
  const contractId = params.id as Id<"contracts">

  const contract = useQuery(api.contracts.get, { contractId })
  const results = useQuery(api.contracts.getResults, { contractId })
  const pdfUrlResponse = useQuery(api.contracts.getPdfUrl, { contractId })

  const loading = contract === undefined || results === undefined || pdfUrlResponse === undefined

  if (loading) {
    return (
      <div className="h-full p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="flex gap-4 h-[calc(100vh-8rem)]">
          <Skeleton className="flex-1 h-full rounded-2xl" />
          <Skeleton className="w-96 h-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!contract || !results) {
    return (
      <div className="h-full p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-xl hover:bg-muted">
            <Link href="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Analysis Error</h1>
        </div>
        <div className="text-center text-muted-foreground py-12">
          Analysis not found or not yet complete. Please check back later.
        </div>
      </div>
    )
  }

  const analysisResult: AnalysisResult = {
    id: contractId,
    contractName: contract.name,
    uploadDate: contract.date,
    riskScore: results.riskScore || 0,
    summary: results.summary || `Analysis complete with ${results.findings?.length || 0} findings.`,
    findings: (results.findings || []).map((finding): Finding => ({
      id: finding.id,
      priority: finding.priority as Finding["priority"],
      matched: finding.matched,
      confidence: finding.confidence,
      category: finding.category,
      title: finding.title,
      description: finding.description,
      pageReferences: finding.pageReferences,
      evidenceExcerpts: finding.evidenceExcerpts,
      recommendation: finding.recommendation,
    })),
    error: results.error,
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-xl hover:bg-muted">
            <Link href="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">{analysisResult.contractName}</h1>
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
              Analysis Complete • {analysisResult.findings.length} Findings
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="default" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <InteractiveViewer result={analysisResult} pdfUrl={pdfUrlResponse?.url || undefined} />
      </div>
    </div>
  )
}
