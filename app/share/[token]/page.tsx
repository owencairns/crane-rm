"use client"

import { useQuery } from "convex/react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { InteractiveViewer } from "@/components/analysis/interactive-viewer"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalysisResult, Finding } from "@/components/contracts/analysis-viewer"
import { api } from "@/convex/_generated/api"
import { FileX } from "lucide-react"

export default function SharedAnalysisPage() {
  const params = useParams()
  const token = params.token as string

  const results = useQuery(api.contracts.getShared, { token })
  const pdfUrlResponse = useQuery(api.contracts.getSharedPdfUrl, { token })

  const loading = results === undefined || pdfUrlResponse === undefined

  const analysisResult: AnalysisResult | null = results
    ? {
        id: results.contractId,
        contractName: results.contractName,
        uploadDate: results.uploadDate,
        riskScore: results.riskScore || 0,
        summary: results.summary,
        findings: results.findings.map((finding): Finding => ({
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
    : null

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2 group">
            <span className="font-bold text-lg tracking-tight text-foreground group-hover:text-primary transition-colors">
              Redline
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Shared analysis
            </span>
          </Link>
          <span className="text-xs text-muted-foreground">
            by Red Cedar Insurance Agency
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 overflow-hidden">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="flex gap-4 h-[calc(100vh-10rem)]">
              <Skeleton className="flex-1 h-full rounded-2xl" />
              <Skeleton className="w-96 h-full rounded-2xl" />
            </div>
          </div>
        ) : !analysisResult ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-md">
              <FileX className="h-12 w-12 text-muted-foreground/40 mx-auto" />
              <h1 className="text-lg font-semibold">Share link not found</h1>
              <p className="text-sm text-muted-foreground">
                This link may have been revoked or the analysis no longer exists. Contact
                the person who shared it for a new link.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 mb-3 flex-shrink-0">
              <h1 className="text-lg font-bold tracking-tight">{analysisResult.contractName}</h1>
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                {analysisResult.findings.filter((f) => f.matched).length} Provisions Flagged
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <InteractiveViewer
                result={analysisResult}
                pdfUrl={pdfUrlResponse?.url || undefined}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
