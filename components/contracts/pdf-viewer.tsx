"use client"

import { FileText } from "lucide-react"

interface PDFViewerProps {
  pdfUrl: string
  onPageChange?: (page: number) => void
  highlightedPages?: number[]
  className?: string
}

export function PDFViewer({ pdfUrl, className }: PDFViewerProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>Contract PDF</span>
        </div>
      </div>

      {/* PDF Iframe Viewer */}
      <div className="flex-1 bg-background/50 overflow-hidden">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title="Contract PDF"
        />
      </div>
    </div>
  )
}
