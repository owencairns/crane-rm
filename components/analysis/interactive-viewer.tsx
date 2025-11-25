"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle, AlertOctagon, ChevronRight, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnalysisResult } from "@/components/contracts/analysis-viewer"
import { PDFViewer } from "@/components/contracts/pdf-viewer"

interface InteractiveViewerProps {
  result: AnalysisResult
  pdfUrl?: string
}

export function InteractiveViewer({ result, pdfUrl }: InteractiveViewerProps) {
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)

  const getRiskColor = (score: number) => {
    if (score >= 80) return "text-destructive"
    if (score >= 50) return "text-orange-500"
    return "text-green-500"
  }

  // Get pages that have findings for highlighting
  const highlightedPages = result.findings
    .filter(f => f.pageReference)
    .map(f => f.pageReference!)

  // Handle finding selection - jump to page if available
  const handleFindingClick = (finding: any) => {
    setSelectedFindingId(finding.id)
    if (finding.pageReference) {
      setCurrentPage(finding.pageReference)
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Left Panel: Document Preview */}
      <div className="flex-1 min-w-0 flex flex-col glass-card rounded-2xl overflow-hidden border border-white/5">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            onPageChange={setCurrentPage}
            highlightedPages={highlightedPages}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <FileIcon className="h-12 w-12 mx-auto opacity-50" />
              <p>PDF not available</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Intelligence Feed */}
      <div className="w-96 flex flex-col glass-card rounded-2xl overflow-hidden border border-white/5">
        <div className="p-6 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-[hsl(var(--neon-amber))]" />
              Analysis Intelligence
            </h2>
            <Badge variant="outline" className={cn("font-mono", getRiskColor(result.riskScore))}>
              Risk: {result.riskScore}%
            </Badge>
          </div>
          
          {/* Risk Heatmap Bar */}
          <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden flex">
            {result.findings.map((f) => (
               <div 
                 key={f.id} 
                 className={cn(
                   "flex-1 border-r border-background/50",
                   f.type === "critical" ? "bg-destructive" : 
                   f.type === "warning" ? "bg-orange-500" : "bg-green-500"
                 )} 
               />
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {result.findings.map((finding) => (
              <div
                key={finding.id}
                onClick={() => handleFindingClick(finding)}
                className={cn(
                  "p-4 rounded-xl border transition-all duration-200 cursor-pointer group",
                  selectedFindingId === finding.id 
                    ? "bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(0,0,0,0.2)]" 
                    : "bg-background/40 border-white/5 hover:bg-background/60 hover:border-white/10"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-1 p-1.5 rounded-lg",
                    finding.type === "critical" ? "bg-destructive/20 text-destructive" :
                    finding.type === "warning" ? "bg-orange-500/20 text-orange-500" :
                    "bg-green-500/20 text-green-500"
                  )}>
                    {finding.type === "critical" ? <AlertOctagon className="h-4 w-4" /> :
                     finding.type === "warning" ? <AlertTriangle className="h-4 w-4" /> :
                     <CheckCircle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                      {finding.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {finding.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                       <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-white/5 hover:bg-white/10">
                         {finding.category}
                       </Badge>
                       {finding.clauseReference && (
                         <span className="text-[10px] text-muted-foreground font-mono">
                           Clause {finding.clauseReference}
                         </span>
                       )}
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    selectedFindingId === finding.id && "text-primary rotate-90"
                  )} />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t border-white/5 bg-background/40 backdrop-blur-sm">
           <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-blue)/0.2)]">
             Generate Report
           </Button>
        </div>
      </div>
    </div>
  )
}

function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}
