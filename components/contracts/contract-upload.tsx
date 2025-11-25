"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, FileText, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ContractUploadProps {
  onUploadComplete: (file: File) => void
  isAnalyzing?: boolean
}

export function ContractUpload({ onUploadComplete, isAnalyzing = false }: ContractUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0]
    if (selectedFile) {
      setFile(selectedFile)
      // Simulate upload progress
      setUploadProgress(0)
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            return 100
          }
          return prev + 10
        })
      }, 100)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    disabled: isAnalyzing
  })

  const handleRemoveFile = () => {
    setFile(null)
    setUploadProgress(0)
  }

  const handleAnalyze = () => {
    if (file) {
      onUploadComplete(file)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {!file ? (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
            isAnalyzing && "opacity-50 cursor-not-allowed"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-muted rounded-full">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Upload Contract</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Drag & drop or click to select a file
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Supports PDF, DOCX, TXT (Max 10MB)
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-6 bg-card">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h4 className="font-medium truncate max-w-[300px]">{file.name}</h4>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            {!isAnalyzing && (
              <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {uploadProgress < 100 ? (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-xs text-muted-foreground text-right">Uploading... {uploadProgress}%</p>
            </div>
          ) : (
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleAnalyze} 
                disabled={isAnalyzing}
                className="w-full sm:w-auto"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing Contract...
                  </>
                ) : (
                  "Start Analysis"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
