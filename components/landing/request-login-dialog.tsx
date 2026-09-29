"use client"

import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, X } from "lucide-react"

interface RequestLoginDialogProps {
  children: React.ReactNode
}

const EMPLOYEE_RANGES = ["1–10", "11–50", "51–200", "201–500", "500+"]

const EMPTY_FORM = {
  name: "",
  company: "",
  email: "",
  phone: "",
  employees: "",
  message: "",
}

// Match the shared Input styling so native <select>/<textarea> line up with it.
const FIELD_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

/**
 * Landing-page "Request a Login" modal. Collects the prospect's details so the
 * Red Cedar team can reach out and provision access, instead of redirecting off
 * to the marketing contact page.
 */
export function RequestLoginDialog({ children }: RequestLoginDialogProps) {
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const handleChange =
    (field: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // No public backend endpoint yet — hand the request off to the Red Cedar
    // team over email so nothing is dropped on the floor.
    const subject = encodeURIComponent(
      `Login request — ${form.company || form.name || "Red Cedar Suite"}`
    )
    const body = encodeURIComponent(
      [
        `Name: ${form.name}`,
        `Company: ${form.company}`,
        `Employees: ${form.employees}`,
        `Email: ${form.email}`,
        `Phone: ${form.phone}`,
        "",
        form.message,
      ].join("\n")
    )
    window.location.href = `mailto:info@redcedaragency.com?subject=${subject}&body=${body}`
    setSubmitted(true)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // Reset a moment after the close animation so it doesn't flash mid-fade.
      setTimeout(() => {
        setSubmitted(false)
        setForm(EMPTY_FORM)
      }, 250)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="bg-black/25 backdrop-blur-[3px] duration-300" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] sm:rounded-lg"
        >
          {submitted ? (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <DialogHeader className="space-y-1.5">
                <DialogTitle className="text-center">Request received</DialogTitle>
                <DialogDescription className="text-center">
                  Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""}. The Red
                  Cedar team will be in touch shortly to get you set up.
                </DialogDescription>
              </DialogHeader>
              <Button className="mt-2" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Request a login</DialogTitle>
                <DialogDescription>
                  Tell us a bit about you and Red Cedar will reach out to get your
                  team access to the suite.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rl-name">Full name</Label>
                  <Input
                    id="rl-name"
                    required
                    value={form.name}
                    onChange={handleChange("name")}
                    placeholder="Jane Contractor"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rl-company">Company</Label>
                    <Input
                      id="rl-company"
                      required
                      value={form.company}
                      onChange={handleChange("company")}
                      placeholder="Acme Construction"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rl-employees">Employees</Label>
                    <select
                      id="rl-employees"
                      required
                      value={form.employees}
                      onChange={handleChange("employees")}
                      className={`${FIELD_CLASS} ${
                        form.employees ? "" : "text-muted-foreground"
                      }`}
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {EMPLOYEE_RANGES.map((range) => (
                        <option key={range} value={range} className="text-foreground">
                          {range}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rl-email">Work email</Label>
                    <Input
                      id="rl-email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange("email")}
                      placeholder="jane@acme.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rl-phone">Phone</Label>
                    <Input
                      id="rl-phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange("phone")}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rl-message">
                    Anything we should know?{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <textarea
                    id="rl-message"
                    value={form.message}
                    onChange={handleChange("message")}
                    rows={3}
                    placeholder="Which tools are you most interested in?"
                    className={`${FIELD_CLASS} h-auto py-2 resize-none`}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Submit request
                </Button>
              </form>
            </>
          )}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
