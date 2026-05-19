"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react"

export default function UsersAdminPage() {
  const me = useQuery(api.users.current)
  const users = useQuery(api.admin.listUsers)
  const promote = useMutation(api.admin.promote)
  const demote = useMutation(api.admin.demote)

  const [pendingId, setPendingId] = useState<string | null>(null)

  if (me && !me.isSuperAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-muted-foreground">
          Only super-admins can manage users.
        </p>
      </div>
    )
  }

  const handlePromote = async (userId: string) => {
    setPendingId(userId)
    try {
      await promote({ userId })
      toast.success("User promoted to admin")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to promote")
    } finally {
      setPendingId(null)
    }
  }

  const handleDemote = async (userId: string) => {
    setPendingId(userId)
    try {
      await demote({ userId })
      toast.success("Admin access revoked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to demote")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Promote users to admin (admins can create invite links). Super-admins
          are configured via the <code>SUPER_ADMIN_EMAILS</code> env var.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {users === undefined ? "Loading…" : `${users.length} total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users === undefined ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No users yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {users.map((u) => {
                const busy = pendingId === u.id
                return (
                  <li
                    key={u.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {u.name || u.email}
                        </span>
                        {u.isSuperAdmin && (
                          <Badge variant="default">Super-admin</Badge>
                        )}
                        {!u.isSuperAdmin && u.isAdmin && (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                        {!u.isAdmin && (
                          <Badge variant="outline">User</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {u.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Joined {new Date(u.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {u.isSuperAdmin ? null : u.isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDemote(u.id)}
                          disabled={busy}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldOff className="h-3.5 w-3.5" />
                          )}
                          Demote
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePromote(u.id)}
                          disabled={busy}
                          className="gap-1.5"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          Promote to admin
                        </Button>
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
