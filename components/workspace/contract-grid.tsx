"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { FileText, ArrowRight, Activity, Calendar, User, MoreHorizontal, Clock } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { useState } from "react"

export interface Contract {
  id: string
  name: string
  client: string
  date: string
  status: "uploaded" | "parsed" | "embedded" | "analyzing" | "complete" | "failed"
  riskScore?: number
}

interface ContractListProps {
  contracts: Contract[]
  viewMode: "grid" | "list"
  onDelete?: (contractId: string) => void
}

export function ContractList({ contracts, viewMode, onDelete }: ContractListProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null)

  const handleDeleteClick = (contract: Contract, e: React.MouseEvent) => {
    e.preventDefault()
    setContractToDelete(contract)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (contractToDelete && onDelete) {
      await onDelete(contractToDelete.id)
      setContractToDelete(null)
    }
  }

  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        {contracts.map((contract) => (
          <div key={contract.id} className="group relative">
            <Link href={`/contracts/${contract.id}`} className="block">
              <div className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/30 hover:border-primary/30 transition-all duration-200 shadow-sm hover:shadow-md">
                <div className="p-2.5 rounded-lg bg-primary/5 text-primary border border-primary/10 group-hover:bg-primary/10 transition-colors">
                  <FileText className="h-5 w-5" />
                </div>
                
                <div className="flex-1 min-w-0 grid grid-cols-12 gap-6 items-center">
                  <div className="col-span-5 sm:col-span-8">
                    <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{contract.name}</h3>
                  </div>
                  <div className="col-span-4 hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{contract.date}</span>
                  </div>
                  <div className="col-span-7 sm:col-span-12 lg:col-span-0 flex justify-end items-center gap-2">
                    {(contract.status === "uploaded" || contract.status === "parsed" || contract.status === "embedded" || contract.status === "analyzing") && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800 dark:text-blue-400 gap-1.5">
                        <Activity className="h-3 w-3 animate-spin" />
                        Processing
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Link>
            
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {contracts.map((contract) => (
        <Link href={`/contracts/${contract.id}`} key={contract.id} className="block group h-full">
          <Card className="h-full flex flex-col border-border/60 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 overflow-hidden bg-card">
            <div className="p-5 flex-1 flex flex-col space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-2.5 rounded-lg bg-primary/5 text-primary border border-primary/10 group-hover:bg-primary/10 transition-colors">
                  <FileText className="h-5 w-5" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-2 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                    <DropdownMenuItem>Download PDF</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => handleDeleteClick(contract, e)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2">
                  {contract.name}
                </h3>
              </div>

              <div className="pt-2 mt-auto flex items-center justify-between border-t border-border/40">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{contract.date}</span>
                </div>

                {(contract.status === "uploaded" || contract.status === "parsed" || contract.status === "embedded" || contract.status === "analyzing") && (
                  <Badge variant="secondary" className="text-xs font-normal bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                    Processing
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Progress Bar for Status */}
            <div className={cn(
              "h-1 w-full transition-colors duration-300",
              (contract.status === "uploaded" || contract.status === "parsed" || contract.status === "embedded" || contract.status === "analyzing") && "bg-blue-500 animate-pulse",
              contract.status === "complete" && "bg-green-500",
              contract.status === "failed" && "bg-destructive"
            )} />
          </Card>
        </Link>
      ))}
      <ConfirmModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Contract"
        description={`Are you sure you want to delete "${contractToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  )
}
