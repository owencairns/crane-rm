"use client"

import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { Loader2 } from "lucide-react"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

/** Renders every page of a PDF at the container's width. */
export default function PdfPreview({ url, maxPages }: { url: string; maxPages?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const [pages, setPages] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setPages(numPages)}
        loading={
          <div className="h-[640px] flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        }
        error={<div className="p-6 text-sm text-muted-foreground">Could not show the PDF here. Use Download.</div>}
      >
        {Array.from({ length: maxPages ? Math.min(pages, maxPages) : pages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="border-b last:border-b-0"
          />
        ))}
      </Document>
      {maxPages && pages > maxPages && (
        <p className="p-4 text-center text-xs text-muted-foreground">
          Showing the first {maxPages} of {pages} pages. Use Open for the rest.
        </p>
      )}
    </div>
  )
}
