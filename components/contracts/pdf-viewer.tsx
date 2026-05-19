"use client"

import { useEffect, useRef } from "react"
import { FileText } from "lucide-react"

interface PDFViewerProps {
  pdfUrl: string
  targetPage?: number
  highlightedPages?: number[]
  className?: string
}

export function PDFViewer({ pdfUrl, targetPage, className }: PDFViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!iframeRef.current || !targetPage) return
    const base = pdfUrl.split("#")[0]
    iframeRef.current.src = `${base}#page=${targetPage}`
  }, [targetPage, pdfUrl])

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>Contract PDF</span>
          {targetPage && <span className="text-xs">· page {targetPage}</span>}
        </div>
      </div>

      <div className="flex-1 bg-background/50 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={pdfUrl}
          className="w-full h-full border-0"
          title="Contract PDF"
        />
      </div>
    </div>
  )
}
