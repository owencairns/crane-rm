"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { Id } from "@/convex/_generated/dataModel"
import { UploadZone } from "@/components/workspace/upload-zone"
import { ContractList, Contract } from "@/components/workspace/contract-grid"
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react"
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
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"

type SortOption = "date" | "name"

interface UploadedContract {
  id: string
  name: string
  file: File
  uploadUrl: string
}

interface ProcessingContract {
  id: string
  name: string
  status: string
  progress?: string
}

export default function WorkspacePage() {
  const contractsQuery = useQuery(api.contracts.list)
  const requestUpload = useMutation(api.contracts.requestUpload)
  const startProcessing = useMutation(api.contracts.startProcessing)
  const deleteContract = useAction(api.contractNode.deleteContract)
  const reprocessContract = useMutation(api.contracts.reprocessContract)

  const [uploadedContracts, setUploadedContracts] = useState<UploadedContract[]>([])
  const [localProcessing, setLocalProcessing] = useState<ProcessingContract[]>([])
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<SortOption>("date")

  const contracts = contractsQuery ?? []
  const loading = contractsQuery === undefined

  const serverProcessing: ProcessingContract[] = contracts
    .filter((contract) =>
      ["uploaded", "parsing", "analyzing"].includes(contract.status)
    )
    .map((contract) => ({
      id: contract.id,
      name: contract.name,
      status: contract.status,
      progress: getStatusMessage(contract.status),
    }))

  const historyContracts = contracts.filter(
    (contract) => contract.status === "complete" || contract.status === "failed"
  )

  const serverIds = new Set([
    ...serverProcessing.map((contract) => contract.id),
    ...historyContracts.map((contract) => contract.id),
  ])

  const processingContracts = [
    ...localProcessing.filter((contract) => !serverIds.has(contract.id)),
    ...serverProcessing,
  ]

  async function handleUpload(file: File) {
    try {
      const response = await requestUpload({
        fileName: file.name,
        contentType: file.type,
      })

      setUploadedContracts((current) => [
        ...current,
        {
          id: response.contractId,
          name: file.name,
          file,
          uploadUrl: response.uploadUrl,
        },
      ])

      toast.success("File ready. Click Start Analysis to upload and process it.")
    } catch (error) {
      console.error("Error preparing upload:", error)
      toast.error(error instanceof Error ? error.message : "Failed to prepare upload")
    }
  }

  async function handleStartAnalysis(uploadedContract: UploadedContract) {
    try {
      setUploadedContracts((current) => current.filter((contract) => contract.id !== uploadedContract.id))
      setLocalProcessing((current) => [
        ...current,
        {
          id: uploadedContract.id,
          name: uploadedContract.name,
          status: "uploading",
          progress: "Uploading file...",
        },
      ])

      const uploadResponse = await fetch(uploadedContract.uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": uploadedContract.file.type || "application/pdf",
        },
        body: uploadedContract.file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to Convex storage")
      }

      const { storageId } = await uploadResponse.json()

      setLocalProcessing((current) =>
        current.map((contract) =>
          contract.id === uploadedContract.id
            ? { ...contract, status: "upload_complete", progress: "Upload complete..." }
            : contract
        )
      )

      setLocalProcessing((current) =>
        current.map((contract) =>
          contract.id === uploadedContract.id
            ? { ...contract, status: "chunking", progress: "Queueing document processing..." }
            : contract
        )
      )

      await startProcessing({
        contractId: uploadedContract.id as Id<"contracts">,
        storageId: storageId as Id<"_storage">,
      })
    } catch (error) {
      console.error("Error starting analysis:", error)
      toast.error(error instanceof Error ? error.message : "Failed to start analysis")
      setLocalProcessing((current) =>
        current.map((contract) =>
          contract.id === uploadedContract.id
            ? { ...contract, status: "failed", progress: "Failed" }
            : contract
        )
      )
    }
  }

  function handleRemoveUploaded(contractId: string) {
    setUploadedContracts((current) => current.filter((contract) => contract.id !== contractId))
  }

  async function handleDelete(contractId: string) {
    try {
      await deleteContract({
        contractId: contractId as Id<"contracts">,
      })
      toast.success("Contract deleted successfully")
    } catch (error) {
      console.error("Error deleting contract:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete contract")
    }
  }

  async function handleReprocess(contractId: string) {
    try {
      await reprocessContract({ contractId: contractId as Id<"contracts"> })
      toast.success("Contract queued for reprocessing")
    } catch (error) {
      console.error("Error reprocessing contract:", error)
      toast.error(error instanceof Error ? error.message : "Failed to reprocess contract")
    }
  }

  const sortedContracts = [...historyContracts].sort((left, right) => {
    if (sortBy === "date") {
      return new Date(right.date).getTime() - new Date(left.date).getTime()
    }
    return left.name.localeCompare(right.name)
  })

  const filteredContracts = sortedContracts.filter((contract) =>
    contract.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Contract Analysis</h1>
              <p className="text-muted-foreground">
                Upload and analyze your crane service contracts for risk assessment.
              </p>
            </div>
          </div>
          <div className="text-center text-muted-foreground py-12">Loading contracts...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Contract Analysis</h1>
            <p className="text-muted-foreground">
              Upload and analyze your crane service contracts for risk assessment.
            </p>
          </div>

          <UploadZone
            onUpload={handleUpload}
            isCompact={
              historyContracts.length > 0 || uploadedContracts.length > 0 || processingContracts.length > 0
            }
          />
        </div>

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
                        <p className="text-sm text-muted-foreground">File selected and ready</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveUploaded(contract.id)}>
                        Remove
                      </Button>
                      <Button size="sm" onClick={() => handleStartAnalysis(contract)} className="gap-2">
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
                      <div
                        className={`p-2 rounded-lg ${
                          contract.status === "complete"
                            ? "bg-green-500/10 text-green-600"
                            : contract.status === "failed"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-blue-500/10 text-blue-600"
                        }`}
                      >
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
                        <p className="text-sm text-muted-foreground">
                          {contract.progress || getStatusMessage(contract.status)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        contract.status === "complete"
                          ? "default"
                          : contract.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {contract.status === "complete"
                        ? "Complete"
                        : contract.status === "failed"
                          ? "Failed"
                          : "Processing"}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">History</h2>
              <Badge variant="secondary">{historyContracts.length}</Badge>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-background p-3 rounded-xl border border-border/60 shadow-sm">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contracts..."
                className="pl-9 border-0 focus-visible:ring-0 bg-transparent h-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="h-6 w-px bg-border/60 mx-2 hidden sm:block" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="hidden sm:inline">Sort:</span>{" "}
                    {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSortBy("date")}>Date (Newest)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name")}>Name (A-Z)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center bg-muted/50 rounded-lg p-1 gap-1">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="icon"
                  className={
                    viewMode === "grid"
                      ? "h-7 w-7 shadow-sm"
                      : "h-7 w-7 text-muted-foreground hover:text-foreground"
                  }
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="icon"
                  className={
                    viewMode === "list"
                      ? "h-7 w-7 shadow-sm"
                      : "h-7 w-7 text-muted-foreground hover:text-foreground"
                  }
                  onClick={() => setViewMode("list")}
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div>
            {filteredContracts.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                {historyContracts.length === 0
                  ? "No completed analyses yet. Upload a contract to get started!"
                  : "No contracts match your search."}
              </div>
            ) : (
              <ContractList
                contracts={filteredContracts as Contract[]}
                viewMode={viewMode}
                onDelete={handleDelete}
                onReprocess={handleReprocess}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "uploading":
      return "Uploading file..."
    case "upload_complete":
      return "Upload complete..."
    case "chunking":
      return "Queueing document processing..."
    case "uploaded":
      return "Document uploaded. Starting OCR..."
    case "parsing":
      return "Extracting text, tables, and images via OCR..."
    case "analyzing":
      return "Analyzing contract provisions..."
    case "complete":
      return "Analysis complete"
    case "failed":
      return "Processing failed"
    default:
      return `Processing (${status})...`
  }
}
