"use client"

import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, FileUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadZoneProps {
  onUpload: (file: File) => void
  isCompact?: boolean
}

export function UploadZone({ onUpload, isCompact = false }: UploadZoneProps) {

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      onUpload(file)
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    noKeyboard: true
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative group cursor-pointer overflow-hidden transition-all duration-300 ease-in-out",
        "border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center",
        isCompact 
          ? "h-32 bg-background border-border/60 hover:border-primary/50 hover:bg-muted/30" 
          : "h-64 bg-background border-border/60 hover:border-primary/50 hover:bg-muted/30 shadow-sm hover:shadow-md",
        isDragActive && "border-primary bg-primary/5 ring-2 ring-primary/20 scale-[1.01]"
      )}
    >
      <input {...getInputProps()} />
      
      <div className="relative z-10 flex flex-col items-center justify-center p-6 transition-transform duration-300 group-hover:-translate-y-1">
        <div className={cn(
          "mb-4 rounded-full flex items-center justify-center transition-all duration-300",
          isDragActive ? "bg-primary text-primary-foreground scale-110" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
          isCompact ? "h-10 w-10" : "h-16 w-16"
        )}>
          {isDragActive ? (
            <FileUp className={cn("animate-bounce", isCompact ? "h-5 w-5" : "h-8 w-8")} />
          ) : (
            <Upload className={cn("transition-transform duration-300 group-hover:scale-110", isCompact ? "h-5 w-5" : "h-8 w-8")} />
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className={cn("font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary", isCompact ? "text-sm" : "text-lg")}>
            {isDragActive ? "Drop file to analyze" : "Upload Contract"}
          </h3>
          <p className={cn("text-muted-foreground max-w-xs mx-auto", isCompact ? "text-xs" : "text-sm")}>
            {isCompact ? "Drag & drop or click to browse" : "Drag & drop your PDF, DOCX, or TXT file here, or click to browse"}
          </p>
        </div>
      </div>

      {/* Subtle Pattern Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px] dark:bg-[radial-gradient(#fff_1px,transparent_1px)]" />
    </div>
  )
}
