"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Copy, Loader2, Plus, Trash2 } from "lucide-react"
import type { Id } from "@/convex/_generated/dataModel"

type InviteStatus = "outstanding" | "consumed" | "revoked" | "expired"

function statusOf(invite: {
  consumedAt?: number
  revokedAt?: number
  expiresAt?: number
}): InviteStatus {
  if (invite.consumedAt) return "consumed"
  if (invite.revokedAt) return "revoked"
  if (invite.expiresAt && invite.expiresAt < Date.now()) return "expired"
  return "outstanding"
}

const statusVariant: Record<InviteStatus, "default" | "secondary" | "destructive" | "outline"> = {
  outstanding: "default",
  consumed: "secondary",
  revoked: "destructive",
  expired: "outline",
}

export default function InvitesAdminPage() {
  const invites = useQuery(api.invites.list)
  const create = useMutation(api.invites.create)
  const revoke = useMutation(api.invites.revoke)

  const [note, setNote] = useState("")
  const [expiryDays, setExpiryDays] = useState<string>("14")
  const [creating, setCreating] = useState(false)

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const expiresInDays = expiryDays.trim() ? Number(expiryDays) : undefined
      if (expiresInDays !== undefined && (!Number.isFinite(expiresInDays) || expiresInDays <= 0)) {
        throw new Error("Expiry must be a positive number of days, or empty")
      }
      const { token } = await create({
        note: note.trim() || undefined,
        expiresInDays,
      })
      const url = `${origin}/signup?token=${token}`
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success("Invite link created and copied to clipboard")
      setNote("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invite")
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (token: string) => {
    const url = `${origin}/signup?token=${token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Invite link copied")
    } catch {
      toast.error("Couldn't copy — link: " + url)
    }
  }

  const handleRevoke = async (id: Id<"invites">) => {
    try {
      await revoke({ id })
      toast.success("Invite revoked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke")
    }
  }

  const sortedInvites = useMemo(() => invites ?? [], [invites])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invites</h1>
        <p className="text-sm text-muted-foreground">
          Generate single-use links for new users. Sign-up is invite-only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate invite</CardTitle>
          <CardDescription>
            Creates a single-use link. Optional note helps you keep track of who it's for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid sm:grid-cols-[1fr_140px] gap-3">
              <div className="space-y-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Input
                  id="note"
                  placeholder="e.g. Chris @ Acme Crane Co."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry">Expires (days)</Label>
                <Input
                  id="expiry"
                  type="number"
                  min={1}
                  placeholder="14"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  disabled={creating}
                />
              </div>
            </div>
            <Button type="submit" disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create invite link
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All invites</CardTitle>
          <CardDescription>
            {invites === undefined ? "Loading…" : `${sortedInvites.length} total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invites === undefined ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No invites yet. Create one above.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sortedInvites.map((invite) => {
                const status = statusOf(invite)
                const url = `${origin}/signup?token=${invite.token}`
                return (
                  <li key={invite.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {invite.note || "(no note)"}
                        </span>
                        <Badge variant={statusVariant[status]} className="capitalize">
                          {status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
                        {url}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(invite.createdAt).toLocaleString()}
                        {invite.expiresAt
                          ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                          : " · no expiry"}
                        {invite.consumedAt
                          ? ` · used ${new Date(invite.consumedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {status === "outstanding" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(invite.token)}
                            className="gap-1.5"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(invite.id)}
                            className="gap-1.5 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
