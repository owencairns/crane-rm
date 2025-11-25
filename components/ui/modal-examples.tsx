"use client"

/**
 * Example usage of the Modal components
 *
 * This file demonstrates how to use both the general Modal and ConfirmModal components.
 * You can delete this file - it's just for reference.
 */

import { useState } from "react"
import { Modal } from "@/components/ui/modal"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Button } from "@/components/ui/button"

export function ModalExamples() {
  // Example 1: Small confirm modal (for delete/confirm actions)
  const [showConfirm, setShowConfirm] = useState(false)

  // Example 2: Large modal (for complex forms/content)
  const [showLargeModal, setShowLargeModal] = useState(false)

  return (
    <div className="space-y-4">
      {/* Example 1: Confirm Modal */}
      <Button onClick={() => setShowConfirm(true)}>
        Show Confirm Modal (Small)
      </Button>

      <ConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={async () => {
          // Your delete/confirm action here
          console.log("Confirmed!")
        }}
        title="Delete Item"
        description="Are you sure you want to delete this item? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
      />

      {/* Example 2: Large Modal */}
      <Button onClick={() => setShowLargeModal(true)}>
        Show Large Modal
      </Button>

      <Modal
        open={showLargeModal}
        onOpenChange={setShowLargeModal}
        title="Large Modal Example"
        description="This is a larger modal for complex content"
        size="xl"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowLargeModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowLargeModal(false)}>
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p>Add your form fields or complex content here.</p>
          <p>The modal supports sizes: sm, default, lg, xl</p>
        </div>
      </Modal>
    </div>
  )
}
