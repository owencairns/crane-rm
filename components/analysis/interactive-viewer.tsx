"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  FileText,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AnalysisResult, Finding } from "@/components/contracts/analysis-viewer"
import { PDFViewer } from "@/components/contracts/pdf-viewer"

interface InteractiveViewerProps {
  result: AnalysisResult
  pdfUrl?: string
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'] as const
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High Priority',
  medium: 'Medium Priority',
  low: 'Low Priority',
}

export function InteractiveViewer({ result, pdfUrl }: InteractiveViewerProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['critical', 'high']))
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined)

  const handlePageClick = (page: number) => setTargetPage(page)

  const visibleFindings = useMemo(
    () => result.findings.filter(f => f.matched),
    [result.findings]
  )

  const groupedFindings = useMemo(() => {
    const groups: Record<string, Finding[]> = {}
    for (const priority of PRIORITY_ORDER) {
      groups[priority] = visibleFindings.filter(f => f.priority === priority)
    }
    return groups
  }, [visibleFindings])

  const highlightedPages = visibleFindings
    .filter(f => f.pageReferences?.length)
    .flatMap(f => f.pageReferences!)

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (priority: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(priority)) next.delete(priority)
      else next.add(priority)
      return next
    })
  }

  const handleFindingClick = (finding: Finding) => {
    setSelectedFindingId(finding.id)
    toggleItem(finding.id)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-destructive'
      case 'high': return 'text-orange-600 dark:text-orange-400'
      case 'medium': return 'text-amber-600 dark:text-amber-400'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4 animate-fade-in">
      {/* Left Panel: Document Preview */}
      <div className="flex-1 min-w-0 flex flex-col rounded-2xl overflow-hidden border border-border/60 bg-card shadow-sm">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            targetPage={targetPage}
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

      {/* Right Panel: Provisions List */}
      <div className="w-[560px] flex flex-col rounded-2xl overflow-hidden border border-border/60 bg-card shadow-sm">
        {/* Header */}
        <div className="p-4 border-b border-border/60 bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2 text-foreground">
              <Zap className="h-4 w-4 text-primary" />
              Provision Analysis
            </h2>
          </div>

          {result.error && (
            <div className="mt-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20">
              <div className="flex items-start gap-2 text-xs text-orange-700 dark:text-orange-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">Analysis incomplete:</span> {result.error.message}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Grouped Provisions List */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {PRIORITY_ORDER.map(priority => {
              const findings = groupedFindings[priority]
              if (findings.length === 0) return null

              const isExpanded = expandedGroups.has(priority)

              return (
                <div key={priority} className="rounded-xl border border-border/60 overflow-hidden">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(priority)}
                    className="w-full px-3 py-2.5 flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                      )}
                      <span className={cn("font-medium text-sm", getPriorityColor(priority))}>
                        {PRIORITY_LABELS[priority]}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        {findings.length}
                      </Badge>
                    </div>
                  </button>

                  {/* Group Items */}
                  {isExpanded && (
                    <div className="border-t border-border/40">
                      {findings.map((finding) => {
                        const isItemExpanded = expandedItems.has(finding.id)
                        const isSelected = selectedFindingId === finding.id

                        return (
                          <div
                            key={finding.id}
                            className={cn(
                              "border-b border-border/30 last:border-b-0 transition-colors",
                              isSelected && "bg-primary/5"
                            )}
                          >
                            <button
                              onClick={() => handleFindingClick(finding)}
                              className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
                            >
                              <div className="p-1.5 rounded-lg flex-shrink-0 bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400">
                                <CheckCircle className="h-4 w-4" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium truncate text-foreground">
                                  {finding.title}
                                </span>
                              </div>

                              <ChevronRight className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                                isItemExpanded && "rotate-90"
                              )} />
                            </button>

                            {/* Expanded Content */}
                            {isItemExpanded && (
                              <div className="px-3 pb-3 pt-1 space-y-3 bg-muted/20 animate-slide-up">
                                <div>
                                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                    Analysis
                                  </h4>
                                  <p className="text-xs text-foreground/80 leading-relaxed">
                                    {finding.description}
                                  </p>
                                </div>

                                {finding.evidenceExcerpts && finding.evidenceExcerpts.length > 0 && (
                                  <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                      Evidence
                                    </h4>
                                    <div className="space-y-2">
                                      {finding.evidenceExcerpts.slice(0, 2).map((excerpt, i) => (
                                        <div
                                          key={i}
                                          className="text-xs p-2 rounded-lg bg-muted/50 border-l-2 border-primary/40 italic text-foreground/70"
                                        >
                                          &ldquo;{excerpt}&rdquo;
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {finding.pageReferences && finding.pageReferences.length > 0 && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <FileText className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">Pages:</span>
                                    {finding.pageReferences.map((p) => (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handlePageClick(p)
                                        }}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                                      >
                                        {p}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {finding.suggestedAction && (
                                  <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                      Suggested Action
                                    </h4>
                                    <p className="text-xs text-foreground/80 p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                      {finding.suggestedAction}
                                    </p>
                                  </div>
                                )}

                                {finding.recommendation && (
                                  <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                      Redline Recommendation
                                    </h4>
                                    <p className="text-xs text-foreground/80">
                                      {finding.recommendation}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t border-border/60 bg-muted/20">
          <Button className="w-full">
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
