"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle, Info, AlertOctagon } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface AnalysisResult {
  id: string
  contractName: string
  uploadDate: string
  riskScore: number // 0-100
  summary: string
  findings: Finding[]
}

export interface Finding {
  id: string
  type: "critical" | "warning" | "info" | "success"
  category: string
  title: string
  description: string
  pageReference?: number
  clauseReference?: string
}

interface AnalysisViewerProps {
  result: AnalysisResult
}

export function AnalysisViewer({ result }: AnalysisViewerProps) {
  const getRiskColor = (score: number) => {
    if (score >= 80) return "text-destructive"
    if (score >= 50) return "text-orange-500"
    return "text-green-500"
  }

  const getRiskLabel = (score: number) => {
    if (score >= 80) return "High Risk"
    if (score >= 50) return "Medium Risk"
    return "Low Risk"
  }

  const getFindingIcon = (type: Finding["type"]) => {
    switch (type) {
      case "critical": return <AlertOctagon className="h-5 w-5 text-destructive" />
      case "warning": return <AlertTriangle className="h-5 w-5 text-orange-500" />
      case "success": return <CheckCircle className="h-5 w-5 text-green-500" />
      default: return <Info className="h-5 w-5 text-blue-500" />
    }
  }



  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
      {/* Left Column: Summary & Stats */}
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Analysis Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center justify-center p-6 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Risk Score</span>
              <div className={`text-5xl font-bold mt-2 ${getRiskColor(result.riskScore)}`}>
                {result.riskScore}
              </div>
              <Badge variant={result.riskScore >= 50 ? "destructive" : "outline"} className="mt-3">
                {getRiskLabel(result.riskScore)}
              </Badge>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Executive Summary</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {result.summary}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border rounded-md text-center">
                <div className="text-2xl font-bold text-destructive">
                  {result.findings.filter(f => f.type === "critical").length}
                </div>
                <div className="text-xs text-muted-foreground">Critical Issues</div>
              </div>
              <div className="p-3 border rounded-md text-center">
                <div className="text-2xl font-bold text-orange-500">
                  {result.findings.filter(f => f.type === "warning").length}
                </div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Detailed Findings */}
      <div className="lg:col-span-2 h-full">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Detailed Findings</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full px-6 pb-6">
              <div className="space-y-6">
                {result.findings.map((finding) => (
                  <div key={finding.id} className="flex gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="mt-1 flex-shrink-0">
                      {getFindingIcon(finding.type)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className="font-semibold text-base">{finding.title}</h4>
                        <Badge variant="outline" className="ml-2 whitespace-nowrap">
                          {finding.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {finding.description}
                      </p>
                      {(finding.pageReference || finding.clauseReference) && (
                        <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                          {finding.pageReference && (
                            <span className="bg-muted px-2 py-1 rounded">Page {finding.pageReference}</span>
                          )}
                          {finding.clauseReference && (
                            <span className="bg-muted px-2 py-1 rounded">Clause {finding.clauseReference}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
