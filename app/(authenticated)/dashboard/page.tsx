"use client"

import { useState, useEffect } from "react"
import { UploadZone } from "@/components/workspace/upload-zone"
import { ContractList, Contract } from "@/components/workspace/contract-grid"
import { Search, LayoutGrid, List as ListIcon, ArrowUpDown, Play, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { backendApi } from "@/lib/backend-api"
import { toast } from "sonner"
import { storage, db } from "@/lib/firebase"
import { ref, uploadBytes } from "firebase/storage"
import { doc, onSnapshot, collection, query, where } from "firebase/firestore"
import { auth } from "@/lib/firebase"

type SortOption = "date" | "name"

interface UploadedContract {
  id: string
  name: string
  file: File
  storagePath: string
  status: "uploaded" | "ready-to-analyze"
}

interface ProcessingContract {
  id: string
  name: string
  status: string // Any status that's not "complete" or "failed"
  progress?: string
}

export default function WorkspacePage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [uploadedContracts, setUploadedContracts] = useState<UploadedContract[]>([])
  const [processingContracts, setProcessingContracts] = useState<ProcessingContract[]>([])
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<SortOption>("date")
  const [loading, setLoading] = useState(true)

  // Set up real-time listener for ALL contracts
  useEffect(() => {
    const userId = auth.currentUser?.uid
    if (!userId) {
      setLoading(false)
      return
    }

    // Subscribe to all user contracts
    const contractsRef = collection(db, "contracts")
    const q = query(contractsRef, where("userId", "==", userId))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const processing: ProcessingContract[] = []
      const completed: Contract[] = []
      const uploaded: UploadedContract[] = []

      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        const status = data.status

        // 1. Handle "Ready to Analyze" (uploaded)
        if (status === "uploaded") {
          // We need to reconstruct the UploadedContract object
          // Note: We won't have the File object here if it was loaded from server
          // This might be a limitation if we need the File object for re-upload
          // But for now, we just display them.
          // If we need to restart analysis, we might need to re-download or handle differently.
          // For this fix, we'll focus on the status display.
          
          // Check if we already have this in local uploadedContracts state to preserve File object if possible
          // This part is tricky because onSnapshot replaces everything.
          // We'll rely on the fact that "uploaded" means it's in the "Ready to Analyze" bucket.
          
          // Actually, for "uploaded" status from server, we should add it to uploadedContracts
          // But we can't easily reconstruct the File object.
          // However, the existing code seemed to rely on local state for File object for "handleStartAnalysis".
          // Let's keep the existing "uploadedContracts" state for locally added files, 
          // AND sync with server for persistence if needed. 
          // BUT the user issue is about "Double Status".
          // "uploaded" status on server = "Ready to Analyze".
          // "processing" status = "parsed", "embedded", "analyzing".
          
          // So, if status is "uploaded", it is NOT processing.
        }

        // 2. Handle Processing
        // Processing statuses: "parsed", "embedded", "analyzing"
        // EXCLUDING "uploaded" which is "Ready to Analyze"
        const isProcessing = status === "parsed" || status === "embedded" || status === "analyzing"

        if (isProcessing) {
          processing.push({
            id: doc.id,
            name: data.filename || data.fileName || "Unknown",
            status: status,
            progress: getStatusMessage(status)
          })
        }

        // 3. Handle Completed/History
        if (status === "complete" || status === "failed") {
           completed.push({
             id: doc.id,
             name: data.filename || data.fileName || "Unknown",
             client: data.client || "Unknown", // Add default or fetch if available
             date: data.date || new Date().toISOString(), // Add default or fetch
             status: status as "complete" | "failed",
             riskScore: data.riskScore
           })
        }

        // Check for newly completed contracts and notify
        // We can check if it WAS in our local processing state
        if (status === "complete") {
           // We can't easily check 'processingContracts' state here due to closure
           // But we can check if we just received it as complete.
           // Ideally we'd compare with previous state, but for now let's just update the lists.
        }
      })

      // Update History
      setContracts(completed)

      // Update Processing
      // We need to MERGE with local processing states (like "uploading", "chunking")
      // which are NOT yet on the server or are transient.
      setProcessingContracts(prev => {
        // Keep local-only states
        const localProcessing = prev.filter(p => 
          p.status === "uploading" || 
          p.status === "chunking" || 
          p.status === "upload_complete" // New intermediate state
        )
        
        // Combine local and server
        // If an ID exists in both, server wins (unless it's 'uploaded' which we filtered out above, 
        // but we want to avoid showing 'uploaded' as processing if server says so)
        
        // Actually, if server says "uploaded", we ignore it for processing list.
        // If server says "parsed", we show it.
        
        // We also need to remove items from localProcessing if they are now in server processing or completed
        const serverIds = new Set([...processing.map(p => p.id), ...completed.map(c => c.id)])
        const filteredLocal = localProcessing.filter(p => !serverIds.has(p.id))
        
        return [...filteredLocal, ...processing]
      })
      
      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const getStatusMessage = (status: string): string => {
    switch (status) {
      case "uploading": return "Uploading file..."
      case "upload_complete": return "Upload complete..."
      case "chunking": return "Processing document..."
      case "uploaded": return "Ready to analyze" // Should not appear in processing usually
      case "parsed": return "Generating embeddings..."
      case "embedded": return "Starting analysis..."
      case "analyzing": return "Analyzing contract provisions..."
      case "complete": return "Analysis complete"
      case "failed": return "Processing failed"
      default: return `Processing (${status})...`
    }
  }

  // Removed loadContracts and loadProcessingContracts as they are redundant with onSnapshot

  const handleUpload = async (file: File) => {
    try {
      // Request upload metadata
      const { contractId, storagePath } = await backendApi.requestUpload(
        file.name,
        file.type
      )

      // Add to uploaded contracts list
      setUploadedContracts(prev => [
        ...prev,
        {
          id: contractId,
          name: file.name,
          file,
          storagePath,
          status: "uploaded"
        }
      ])

      toast.success("File ready! Click 'Start Analysis' to begin processing.")
    } catch (error: any) {
      console.error("Error preparing upload:", error)
      toast.error(error instanceof Error ? error.message : "Failed to prepare upload")
    }
  }

  const handleStartAnalysis = async (uploadedContract: UploadedContract) => {
    try {
      // Move to processing section
      setUploadedContracts(prev => prev.filter(c => c.id !== uploadedContract.id))
      setProcessingContracts(prev => [
        ...prev,
        {
          id: uploadedContract.id,
          name: uploadedContract.name,
          status: "uploading",
          progress: "Uploading file..."
        }
      ])

      // Upload file to Firebase Storage using the storagePath from backend
      const storageRef = ref(storage, uploadedContract.storagePath)
      await uploadBytes(storageRef, uploadedContract.file, {
        contentType: uploadedContract.file.type,
      })

      // Update status - Use "upload_complete" to avoid "uploaded" conflict
      setProcessingContracts(prev =>
        prev.map(c => c.id === uploadedContract.id
          ? { ...c, status: "upload_complete", progress: "File uploaded" }
          : c
        )
      )

      // Confirm upload
      await backendApi.confirmUpload(uploadedContract.id)

      // Ingest contract
      setProcessingContracts(prev =>
        prev.map(c => c.id === uploadedContract.id
          ? { ...c, status: "chunking", progress: "Processing document..." }
          : c
        )
      )

      await backendApi.ingestContract(uploadedContract.id)

      // The real-time listener will handle the rest
    } catch (error: any) {
      console.error("Error starting analysis:", error)
      toast.error(error instanceof Error ? error.message : "Failed to start analysis")
      setProcessingContracts(prev =>
        prev.map(c => c.id === uploadedContract.id
          ? { ...c, status: "failed", progress: "Failed" }
          : c
        )
      )
    }
  }

  const handleRemoveUploaded = (contractId: string) => {
    setUploadedContracts(prev => prev.filter(c => c.id !== contractId))
  }

  const handleDelete = async (contractId: string) => {
    try {
      await backendApi.deleteContract(contractId)
      toast.success("Contract deleted successfully")
      // Remove from local state
      setContracts(prev => prev.filter(c => c.id !== contractId))
    } catch (error: any) {
      console.error("Error deleting contract:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete contract")
    }
  }

  const sortedContracts = [...contracts].sort((a, b) => {
    if (sortBy === "date") {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    }
    if (sortBy === "name") return a.name.localeCompare(b.name)
    return 0
  })

  const filteredContracts = sortedContracts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="bg-muted/30 p-6 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Contract Analysis</h1>
              <p className="text-muted-foreground">Upload and analyze your construction contracts.</p>
            </div>
          </div>
          <div className="text-center text-muted-foreground">Loading contracts...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header Section */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Contract Analysis</h1>
            <p className="text-muted-foreground">Upload and analyze your construction contracts.</p>
          </div>

          <UploadZone onUpload={handleUpload} isCompact={contracts.length > 0 || uploadedContracts.length > 0 || processingContracts.length > 0} />
        </div>

        {/* Uploaded Contracts - Ready to Analyze */}
        {uploadedContracts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Ready to Analyze</h2>
              <Badge variant="secondary">{uploadedContracts.length}</Badge>
            </div>
            <div className="space-y-3">
              {uploadedContracts.map((contract) => (
                <Card key={contract.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{contract.name}</h3>
                        <p className="text-sm text-muted-foreground">File uploaded and ready</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUploaded(contract.id)}
                      >
                        Remove
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleStartAnalysis(contract)}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Start Analysis
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Processing Contracts */}
        {processingContracts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Processing</h2>
              <Badge variant="secondary">{processingContracts.length}</Badge>
            </div>
            <div className="space-y-3">
              {processingContracts.map((contract) => (
                <Card key={contract.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`p-2 rounded-lg ${
                        contract.status === "complete" ? "bg-green-500/10 text-green-600" :
                        contract.status === "failed" ? "bg-red-500/10 text-red-600" :
                        "bg-blue-500/10 text-blue-600"
                      }`}>
                        {contract.status === "complete" ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : contract.status === "failed" ? (
                          <XCircle className="h-5 w-5" />
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{contract.name}</h3>
                        <p className="text-sm text-muted-foreground">{contract.progress || getStatusMessage(contract.status)}</p>
                      </div>
                    </div>
                    <Badge variant={
                      contract.status === "complete" ? "default" :
                      contract.status === "failed" ? "destructive" :
                      "secondary"
                    }>
                      {contract.status === "complete" ? "Complete" :
                       contract.status === "failed" ? "Failed" :
                       "Processing"}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* History Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">History</h2>
              <Badge variant="secondary">{contracts.length}</Badge>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-background p-3 rounded-xl border border-border/60 shadow-sm">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contracts..."
                className="pl-9 border-0 focus-visible:ring-0 bg-transparent h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="h-6 w-px bg-border/60 mx-2 hidden sm:block" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="hidden sm:inline">Sort:</span> {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSortBy("date")}>
                    Date (Newest)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name")}>
                    Name (A-Z)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center bg-muted/50 rounded-lg p-1 gap-1">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="icon"
                  className={viewMode === "grid" ? "h-7 w-7 shadow-sm" : "h-7 w-7 text-muted-foreground hover:text-foreground"}
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="icon"
                  className={viewMode === "list" ? "h-7 w-7 shadow-sm" : "h-7 w-7 text-muted-foreground hover:text-foreground"}
                  onClick={() => setViewMode("list")}
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Contract List */}
          <div>
            {filteredContracts.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                {contracts.length === 0 ? "No completed analyses yet. Upload a contract to get started!" : "No contracts match your search."}
              </div>
            ) : (
              <ContractList contracts={filteredContracts} viewMode={viewMode} onDelete={handleDelete} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
