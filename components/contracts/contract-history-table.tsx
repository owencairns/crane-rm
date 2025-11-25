"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, FileText, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"

export interface ContractRecord {
  id: string
  name: string
  uploadDate: string
  status: "analyzing" | "completed" | "failed"
  riskScore?: number
  clientName?: string
}

interface ContractHistoryTableProps {
  contracts: ContractRecord[]
}

export function ContractHistoryTable({ contracts }: ContractHistoryTableProps) {
  const getStatusBadge = (status: ContractRecord["status"]) => {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">Completed</Badge>
      case "analyzing":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200">Analyzing</Badge>
      case "failed":
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getRiskBadge = (score?: number) => {
    if (score === undefined) return <span className="text-muted-foreground">-</span>
    if (score >= 80) return <Badge variant="destructive">High ({score})</Badge>
    if (score >= 50) return <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-200">Medium ({score})</Badge>
    return <Badge variant="outline" className="text-green-700 border-green-200">Low ({score})</Badge>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contract Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Date Uploaded</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Risk Level</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No contracts found.
              </TableCell>
            </TableRow>
          ) : (
            contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {contract.name}
                  </div>
                </TableCell>
                <TableCell>{contract.clientName || "Unknown Client"}</TableCell>
                <TableCell>{contract.uploadDate}</TableCell>
                <TableCell>{getStatusBadge(contract.status)}</TableCell>
                <TableCell>{getRiskBadge(contract.riskScore)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/contracts/${contract.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Analysis
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        Delete Record
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
