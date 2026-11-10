"use client"

import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, FileCheck2, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileDropProps {
  label: string
  hint: string
  file: File | null
  onSelect: (file: File | null) => void
  disabled?: boolean
}

interface MultiFileDropProps {
  label: string
  hint: string
  files: File[]
  onSelect: (files: File[]) => void
  disabled?: boolean
}

export function FileDrop({ label, hint, file, onSelect, disabled }: FileDropProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const next = accepted[0]
      if (next) onSelect(next)
    },
    [onSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noKeyboard: true,
    disabled,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  })

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {file ? (
        <div className="flex items-center justify-between h-40 px-5 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB · ready
              </p>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "h-40 cursor-pointer rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center px-6 transition-all",
            "border-border/60 hover:border-primary/30 hover:bg-primary/3",
            isDragActive && "border-primary bg-primary/5 ring-2 ring-primary/15",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          <input {...getInputProps()} />
          <div className="mb-3 h-11 w-11 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
            <Upload className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">{hint}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">PDF · drag & drop or click</p>
        </div>
      )}
    </div>
  )
}

export function MultiFileDrop({
  label,
  hint,
  files,
  onSelect,
  disabled,
}: MultiFileDropProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) return
      onSelect([...files, ...accepted])
    },
    [files, onSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noKeyboard: true,
    disabled,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
  })

  function removeFile(index: number) {
    onSelect(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div
        {...getRootProps()}
        className={cn(
          "min-h-40 cursor-pointer rounded-xl border-2 border-dashed flex flex-col justify-center px-5 py-4 transition-all",
          files.length > 0
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border/60 hover:border-primary/30 hover:bg-primary/3",
          isDragActive && "border-primary bg-primary/5 ring-2 ring-primary/15",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        {files.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">{files.length} PDFs ready</p>
                <p className="text-xs text-muted-foreground">
                  Drop more PDFs here to add endorsements or schedules.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-6">
            <div className="mb-3 h-11 w-11 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
              <Upload className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">{hint}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              PDFs · drag & drop or click
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
