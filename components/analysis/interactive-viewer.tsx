"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  FileText,
  AlertCircle,
  Search,
  Bot
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AnalysisResult, Finding } from "@/components/contracts/analysis-viewer"
import { PDFViewer } from "@/components/contracts/pdf-viewer"

interface InteractiveViewerProps {
  result: AnalysisResult
  pdfUrl?: string
}

// Priority display order and labels
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
  const [currentPage, setCurrentPage] = useState<number>(1)

  // Group findings by priority
  const groupedFindings = useMemo(() => {
    const groups: Record<string, Finding[]> = {}

    for (const priority of PRIORITY_ORDER) {
      groups[priority] = result.findings.filter(f => f.priority === priority)
    }

    return groups
  }, [result.findings])

  // Get summary stats
  const stats = useMemo(() => {
    const matched = result.findings.filter(f => f.matched).length
    const notMatched = result.findings.filter(f => !f.matched).length
    const criticalMissing = result.findings.filter(f => !f.matched && f.priority === 'critical').length
    const highMissing = result.findings.filter(f => !f.matched && f.priority === 'high').length

    return { matched, notMatched, criticalMissing, highMissing }
  }, [result.findings])

  // Get pages that have findings for highlighting
  const highlightedPages = result.findings
    .filter(f => f.pageReferences?.length)
    .flatMap(f => f.pageReferences!)

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleGroup = (priority: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(priority)) {
        next.delete(priority)
      } else {
        next.add(priority)
      }
      return next
    })
  }

  const handleFindingClick = (finding: Finding) => {
    setSelectedFindingId(finding.id)
    toggleItem(finding.id)
    if (finding.pageReferences?.[0]) {
      setCurrentPage(finding.pageReferences[0])
    }
  }

  // Get screening method indicator
  const getScreeningBadge = (finding: Finding) => {
    if (!finding.screeningResult) return null

    switch (finding.screeningResult) {
      case 'no_candidates':
        return {
          icon: <Search className="h-2.5 w-2.5" />,
          label: "No matches in contract",
          tooltip: "Pre-screening found no matching text",
          className: "bg-slate-500/20 text-slate-400"
        }
      case 'analyzed_not_found':
        return {
          icon: <Bot className="h-2.5 w-2.5" />,
          label: "Analyzed - not found",
          tooltip: "AI analyzed candidates but provision not present",
          className: "bg-blue-500/20 text-blue-400"
        }
      case 'analyzed_found':
        return {
          icon: <Bot className="h-2.5 w-2.5" />,
          label: "Analyzed - found",
          tooltip: "AI confirmed provision is present",
          className: "bg-green-500/20 text-green-400"
        }
      case 'not_analyzed':
        return {
          icon: <AlertCircle className="h-2.5 w-2.5" />,
          label: "Not analyzed",
          tooltip: "Processing limit reached",
          className: "bg-yellow-500/20 text-yellow-400"
        }
      case 'error':
        return {
          icon: <AlertTriangle className="h-2.5 w-2.5" />,
          label: "Error",
          tooltip: "Error during analysis",
          className: "bg-red-500/20 text-red-400"
        }
      default:
        return null
    }
  }

  // Determine icon and color based on matched status, priority, and screening result
  const getStatusDisplay = (finding: Finding) => {
    if (finding.matched) {
      return {
        icon: <CheckCircle className="h-4 w-4" />,
        bgColor: "bg-green-500/20",
        textColor: "text-green-500",
        label: "Found",
        sublabel: null,
      }
    }

    // Not matched - differentiate by screening result
    const isHighPriority = finding.priority === 'critical' || finding.priority === 'high'

    // Pre-screening found no matches at all
    if (finding.screeningResult === 'no_candidates') {
      return {
        icon: <Search className="h-4 w-4" />,
        bgColor: "bg-slate-500/20",
        textColor: "text-slate-400",
        label: "Not in Contract",
        sublabel: "No matching text found",
      }
    }

    // LLM analyzed but didn't find sufficient evidence
    if (finding.screeningResult === 'analyzed_not_found') {
      return {
        icon: <Bot className="h-4 w-4" />,
        bgColor: isHighPriority ? "bg-blue-500/20" : "bg-blue-500/10",
        textColor: "text-blue-400",
        label: "Not Found",
        sublabel: "Analyzed - insufficient evidence",
      }
    }

    // Error or not analyzed
    if (finding.screeningResult === 'error' || finding.screeningResult === 'not_analyzed') {
      return {
        icon: <AlertCircle className="h-4 w-4" />,
        bgColor: "bg-yellow-500/20",
        textColor: "text-yellow-500",
        label: "Not Analyzed",
        sublabel: finding.screeningResult === 'error' ? "Error occurred" : "Processing limit",
      }
    }

    // Fallback for old data without screeningResult
    if (isHighPriority) {
      return {
        icon: <XCircle className="h-4 w-4" />,
        bgColor: "bg-destructive/20",
        textColor: "text-destructive",
        label: "Not Found",
        sublabel: null,
      }
    }

    return {
      icon: <AlertTriangle className="h-4 w-4" />,
      bgColor: "bg-orange-500/20",
      textColor: "text-orange-500",
      label: "Not Found",
      sublabel: null,
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-destructive'
      case 'high': return 'text-orange-500'
      case 'medium': return 'text-yellow-500'
      default: return 'text-muted-foreground'
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

      {/* Right Panel: Provisions List */}
      <div className="w-[560px] flex flex-col glass-card rounded-2xl overflow-hidden border border-white/5">
        {/* Header */}
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-[hsl(var(--neon-amber))]" />
              Provision Analysis
            </h2>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              <span className="text-green-500 font-medium">{stats.matched} Found</span>
            </div>
          </div>

          {/* Error banner if there was a partial failure */}
          {result.error && (
            <div className="mt-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-start gap-2 text-xs text-orange-500">
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
                <div key={priority} className="rounded-xl border border-white/5 overflow-hidden">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(priority)}
                    className="w-full px-3 py-2.5 flex items-center justify-between bg-background/40 hover:bg-background/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                    <div className="border-t border-white/5">
                      {findings.map((finding) => {
                        const status = getStatusDisplay(finding)
                        const screeningBadge = getScreeningBadge(finding)
                        const isItemExpanded = expandedItems.has(finding.id)
                        const isSelected = selectedFindingId === finding.id

                        return (
                          <div
                            key={finding.id}
                            className={cn(
                              "border-b border-white/5 last:border-b-0 transition-colors",
                              isSelected && "bg-primary/5"
                            )}
                          >
                            {/* Item Header - Clickable */}
                            <button
                              onClick={() => handleFindingClick(finding)}
                              className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-background/40 transition-colors text-left"
                            >
                              <div className={cn(
                                "p-1.5 rounded-lg flex-shrink-0",
                                status.bgColor,
                                status.textColor
                              )}>
                                {status.icon}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {finding.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={cn("text-[10px] font-medium", status.textColor)}>
                                    {status.label}
                                  </span>
                                  {screeningBadge && (
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]",
                                        screeningBadge.className
                                      )}
                                      title={screeningBadge.tooltip}
                                    >
                                      {screeningBadge.icon}
                                      <span className="hidden sm:inline">{screeningBadge.label}</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              <ChevronRight className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                                isItemExpanded && "rotate-90"
                              )} />
                            </button>

                            {/* Expanded Content */}
                            {isItemExpanded && (
                              <div className="px-3 pb-3 pt-1 space-y-3 bg-background/20">
                                {/* Description */}
                                <div>
                                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                    Analysis
                                  </h4>
                                  <p className="text-xs text-foreground/80 leading-relaxed">
                                    {finding.description}
                                  </p>
                                </div>

                                {/* Evidence */}
                                {finding.evidenceExcerpts && finding.evidenceExcerpts.length > 0 && (
                                  <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                      Evidence
                                    </h4>
                                    <div className="space-y-2">
                                      {finding.evidenceExcerpts.slice(0, 2).map((excerpt, i) => (
                                        <div
                                          key={i}
                                          className="text-xs p-2 rounded-lg bg-background/40 border-l-2 border-primary/50 italic text-foreground/70"
                                        >
                                          &ldquo;{excerpt}&rdquo;
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Page References */}
                                {finding.pageReferences && finding.pageReferences.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">
                                      Pages: {finding.pageReferences.join(', ')}
                                    </span>
                                  </div>
                                )}

                                {/* Suggested Action (from provision catalog) */}
                                {finding.suggestedAction && (
                                  <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                      Suggested Action
                                    </h4>
                                    <p className="text-xs text-foreground/80 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                      {finding.suggestedAction}
                                    </p>
                                  </div>
                                )}

                                {/* Recommendation (from LLM) */}
                                {finding.recommendation && (
                                  <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                      AI Recommendation
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
        <div className="p-3 border-t border-white/5 bg-background/40 backdrop-blur-sm">
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
