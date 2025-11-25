"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "destructive"
  className?: string
}

export function ConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  className,
}: ConfirmModalProps) {
  const [isLoading, setIsLoading] = React.useState(false)

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      console.error("Confirmation action failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-100",
          "duration-200",
          className
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function useConfirmModal() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [config, setConfig] = React.useState<Omit<ConfirmModalProps, "open" | "onOpenChange">>({
    onConfirm: () => {},
    title: "",
    description: "",
  })

  const confirm = React.useCallback(
    (options: Omit<ConfirmModalProps, "open" | "onOpenChange">) => {
      return new Promise<boolean>((resolve) => {
        setConfig({
          ...options,
          onConfirm: async () => {
            await options.onConfirm()
            resolve(true)
          },
        })
        setIsOpen(true)
      })
    },
    []
  )

  const modal = (
    <ConfirmModal
      {...config}
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          // User cancelled
        }
      }}
    />
  )

  return { confirm, modal, isOpen, setIsOpen }
}
