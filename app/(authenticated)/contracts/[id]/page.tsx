"use client"

import { InteractiveViewer } from "@/components/analysis/interactive-viewer"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Share2, Download, MoreVertical } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalysisResult } from "@/components/contracts/analysis-viewer"
import { backendApi } from "@/lib/backend-api"
import { toast } from "sonner"

export default function AnalysisPage() {
  const params = useParams()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalysisResults()
  }, [params.id])

  const loadAnalysisResults = async () => {
    try {
      setLoading(true)
      setError(null)

      const contractId = params.id as string

      // Get contract details, analysis results, and PDF URL
      const [contract, results, pdfUrlResponse] = await Promise.all([
        backendApi.getContract(contractId),
        backendApi.getResults(contractId),
        backendApi.getPdfUrl(contractId).catch(err => {
          console.warn('Failed to load PDF URL:', err)
          return null
        }),
      ])

      // Set PDF URL if available
      if (pdfUrlResponse?.url) {
        setPdfUrl(pdfUrlResponse.url)
      }

      // Transform backend data to AnalysisResult format
      // Handle date parsing - contract.date might already be a formatted string
      let uploadDate: string
      try {
        const parsedDate = new Date(contract.date)
        uploadDate = isNaN(parsedDate.getTime())
          ? contract.date // Use as-is if already formatted
          : parsedDate.toISOString().split('T')[0]
      } catch {
        uploadDate = contract.date || new Date().toISOString().split('T')[0]
      }

      const analysisResult: AnalysisResult = {
        id: contractId,
        contractName: contract.name,
        uploadDate,
        riskScore: results.riskScore || 0,
        summary: results.summary || `Analysis complete with ${results.findings?.length || 0} findings.`,
        findings: (results.findings || []).map(finding => ({
          id: finding.id,
          type: finding.severity === 'high' ? 'critical' : finding.severity === 'medium' ? 'warning' : 'success',
          category: finding.category,
          title: finding.title,
          description: finding.description,
          pageReference: finding.pageReference,
          clauseReference: finding.clauseText || undefined,
        })),
      }

      setResult(analysisResult)
    } catch (error: any) {
      console.error("Error loading analysis results:", error)
      setError(error.message || "Failed to load analysis results")
      toast.error(error.message || "Failed to load analysis results")
    } finally {
      setLoading(false)
    }
  }

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

  if (error || !result) {
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
          {error || "Analysis not found or not yet complete. Please check back later."}
        </div>
      </div>
    )
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
             <h1 className="text-xl font-bold tracking-tight">{result.contractName}</h1>
             <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
               Analysis Complete • {result.findings.length} Findings
             </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="default" size="sm" className="gap-2 shadow-[0_0_15px_hsl(var(--neon-blue)/0.3)]">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <InteractiveViewer result={result} pdfUrl={pdfUrl || undefined} />
      </div>
    </div>
  )
}
