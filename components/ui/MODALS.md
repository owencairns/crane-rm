# Modal Components

This project includes two reusable modal components with subtle animations:

## Components

### 1. ConfirmModal (Small)
A compact modal for confirmation dialogs like delete actions.

**Features:**
- Small, focused design
- Destructive variant support
- Loading state during async actions
- Smooth fade + zoom animations

**Usage:**
```tsx
import { ConfirmModal } from "@/components/ui/confirm-modal"

const [open, setOpen] = useState(false)

<ConfirmModal
  open={open}
  onOpenChange={setOpen}
  onConfirm={async () => {
    // Your action here
  }}
  title="Delete Item"
  description="Are you sure? This action cannot be undone."
  confirmText="Delete"
  variant="destructive"
/>
```

**Props:**
- `open`: boolean - Controls modal visibility
- `onOpenChange`: (open: boolean) => void - Callback when modal opens/closes
- `onConfirm`: () => void | Promise<void> - Action to perform on confirm
- `title`: string - Modal title
- `description`: string - Modal description
- `confirmText?`: string - Confirm button text (default: "Confirm")
- `cancelText?`: string - Cancel button text (default: "Cancel")
- `variant?`: "default" | "destructive" - Button variant (default: "default")

### 2. Modal (Large/Flexible)
A flexible modal for complex content, forms, or detailed views.

**Features:**
- Multiple size options (sm, default, lg, xl)
- Custom footer support
- Optional title and description
- Smooth fade + zoom + slide animations

**Usage:**
```tsx
import { Modal } from "@/components/ui/modal"

const [open, setOpen] = useState(false)

<Modal
  open={open}
  onOpenChange={setOpen}
  title="Edit Details"
  description="Make changes to your information"
  size="lg"
  footer={
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </>
  }
>
  {/* Your form or content here */}
</Modal>
```

**Props:**
- `open`: boolean - Controls modal visibility
- `onOpenChange`: (open: boolean) => void - Callback when modal opens/closes
- `title?`: string - Optional modal title
- `description?`: string - Optional modal description
- `size?`: "sm" | "default" | "lg" | "xl" - Modal size (default: "default")
- `footer?`: React.ReactNode - Optional footer content
- `children`: React.ReactNode - Modal content
- `className?`: string - Additional CSS classes

## Animations

Both modals include subtle animations:
- **Fade in/out**: Smooth opacity transitions
- **Zoom in/out**: Scale from 95% to 100%
- **Slide in**: Slides from top-center
- **Duration**: 200ms for smooth, professional feel

## Helper Hook: useConfirmModal

For programmatic confirmation dialogs:

```tsx
import { useConfirmModal } from "@/components/ui/confirm-modal"

function MyComponent() {
  const { confirm, modal } = useConfirmModal()

  const handleDelete = async () => {
    await confirm({
      title: "Delete Item",
      description: "Are you sure?",
      confirmText: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        // Your delete logic
      }
    })
  }

  return (
    <>
      <Button onClick={handleDelete}>Delete</Button>
      {modal}
    </>
  )
}
```
