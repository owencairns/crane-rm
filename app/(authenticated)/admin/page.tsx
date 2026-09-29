"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  applyPlaceholders,
  INVITE_PLACEHOLDERS,
  renderInvitationEmailHtml,
} from "@/convex/lib/inviteEmail"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useConfirmModal } from "@/components/ui/confirm-modal"
import type { Id } from "@/convex/_generated/dataModel"
import { toast } from "sonner"
import { Copy, Eye, Infinity, Loader2, Mail, MailCheck, RotateCw, Save, ShieldAlert, UserPlus, Users } from "lucide-react"

function formatDate(ts: number | null) {
  if (!ts) return "—"
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function statusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    accepted: "default",
    pending: "secondary",
    expired: "outline",
    revoked: "destructive",
  }
  return <Badge variant={map[status] ?? "outline"}>{status}</Badge>
}

function InviteForm() {
  const createInvite = useMutation(api.invitations.create)
  const [email, setEmail] = useState("")
  const [accessWindowDays, setAccessWindowDays] = useState("90")
  const [inviteValidDays, setInviteValidDays] = useState("14")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await createInvite({
        email,
        accessWindowDays: Number(accessWindowDays) || 90,
        inviteValidDays: Number(inviteValidDays) || 14,
        emailSubject: subject.trim() || undefined,
        emailBody: body.trim() || undefined,
      })
      toast.success("Invitation sent", {
        description: "The invite email is on its way. You can also copy the link below.",
      })
      try {
        await navigator.clipboard.writeText(res.inviteUrl)
      } catch {
        /* clipboard optional */
      }
      setEmail("")
      setSubject("")
      setBody("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create invitation.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Invite someone</CardTitle>
        </div>
        <CardDescription>
          Send an invitation email via Brevo. The access window starts when they accept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invite-email">Invitee email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="window">Access window (days)</Label>
              <Input
                id="window"
                type="number"
                min={1}
                max={3650}
                value={accessWindowDays}
                onChange={(e) => setAccessWindowDays(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valid">Invite link valid for (days)</Label>
              <Input
                id="valid"
                type="number"
                min={1}
                max={365}
                value={inviteValidDays}
                onChange={(e) => setInviteValidDays(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Email subject (optional)</Label>
            <Input
              id="subject"
              placeholder="You've been invited to the Red Cedar Suite"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Custom message (optional)</Label>
            <textarea
              id="body"
              className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Add a personal note. Placeholders: {{invite_url}}, {{inviter}}, {{access_days}}"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the saved invitation template below.
            </p>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {loading ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function InvitationEmailCard({ adminEmail }: { adminEmail: string | null }) {
  const template = useQuery(api.emailTemplate.get)
  const save = useMutation(api.emailTemplate.save)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin)
  }, [])

  // Seed the editor once the saved template arrives (don't clobber edits after).
  useEffect(() => {
    if (template && !loaded) {
      setSubject(template.subject)
      setBody(template.body)
      setLoaded(true)
    }
  }, [template, loaded])

  const base = origin || "https://tools.redcedaragency.com"
  const sampleVars = {
    inviteUrl: `${base}/accept-invite?token=preview`,
    inviter: adminEmail || "an administrator",
    accessDays: 90,
  }

  const previewHtml = useMemo(
    () =>
      renderInvitationEmailHtml({
        ...sampleVars,
        body,
        logoUrl: `${base}/red-cedar-logo.png`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, body, adminEmail]
  )

  const dirty =
    loaded && !!template && (subject !== template.subject || body !== template.body)

  const handleSave = async () => {
    setSaving(true)
    try {
      await save({ subject: subject.trim(), body: body.trim() })
      toast.success("Email template saved", {
        description: "Future invitations will use this by default.",
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template.")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (template) {
      setSubject(template.subject)
      setBody(template.body)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MailCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Invitation email</CardTitle>
          {dirty && (
            <Badge variant="secondary" className="ml-1">
              Unsaved changes
            </Badge>
          )}
        </div>
        <CardDescription>
          The default email sent with every invitation. Edit it here — changes are
          saved and reused for all future invites. A per-invite override still
          wins when you fill in the fields above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {template === undefined ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Editor */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tmpl-subject">Subject</Label>
                <Input
                  id="tmpl-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmpl-body">Body</Label>
                <textarea
                  id="tmpl-body"
                  className="flex min-h-48 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={saving}
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    Blank lines start new paragraphs. Wrap text in{" "}
                    <code className="rounded bg-muted px-1">**asterisks**</code> for
                    bold. Placeholders:
                  </p>
                  <ul className="space-y-0.5">
                    {INVITE_PLACEHOLDERS.map((p) => (
                      <li key={p.token}>
                        <code className="rounded bg-muted px-1">{p.token}</code> —{" "}
                        {p.description}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? "Saving…" : "Save template"}
                </Button>
                <Button variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {template.isDefault
                  ? "Currently using the built-in default."
                  : `Last saved ${formatDate(template.updatedAt)}${
                      template.updatedByEmail ? ` by ${template.updatedByEmail}` : ""
                    }.`}
              </p>
            </div>

            {/* Live preview */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="h-4 w-4" /> Live preview
              </div>
              <div className="rounded-lg border overflow-hidden">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Subject:</span>{" "}
                  {applyPlaceholders(subject, sampleVars) || (
                    <span className="italic">(empty)</span>
                  )}
                </div>
                <iframe
                  title="Invitation email preview"
                  srcDoc={previewHtml}
                  className="w-full h-[520px] bg-white"
                  sandbox=""
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function InvitationsTable() {
  const invitations = useQuery(api.invitations.list)
  const revoke = useMutation(api.invitations.revoke)
  const resend = useMutation(api.invitations.resend)
  const [busyId, setBusyId] = useState<string | null>(null)

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Invite link copied")
    } catch {
      toast.error("Could not copy link")
    }
  }

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Invitations</CardTitle>
        <CardDescription>Pending and past invitations.</CardDescription>
      </CardHeader>
      <CardContent>
        {invitations === undefined ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : invitations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No invitations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Link expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">
                      {inv.email}
                      {inv.lastSendError && (
                        <span className="block text-xs text-destructive">
                          send failed: {inv.lastSendError}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {statusBadge(inv.linkExpired ? "expired" : inv.status)}
                    </TableCell>
                    <TableCell>{inv.accessWindowDays}d</TableCell>
                    <TableCell>{formatDate(inv.expiresAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyLink(inv.inviteUrl)}
                          title="Copy invite link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {inv.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === inv.id}
                              onClick={() =>
                                run(inv.id, () => resend({ invitationId: inv.id }), "Invitation resent")
                              }
                              title="Resend email"
                            >
                              <RotateCw className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busyId === inv.id}
                              onClick={() =>
                                run(inv.id, () => revoke({ invitationId: inv.id }), "Invitation revoked")
                              }
                            >
                              Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UsersTable() {
  const users = useQuery(api.admin.listUsers)
  const extend = useMutation(api.admin.extendAccess)
  const renew = useMutation(api.admin.renewAccess)
  const revoke = useMutation(api.admin.revokeAccess)
  const restore = useMutation(api.admin.restoreAccess)
  const grantUnlimited = useMutation(api.admin.grantUnlimitedAccess)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { confirm, modal } = useConfirmModal()

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  const confirmUnlimited = (u: { id: Id<"userAccess">; email: string }) =>
    confirm({
      title: "Grant unlimited access?",
      description: `${u.email} will keep access indefinitely — the expiry lock is removed until you revoke or renew with a new window.`,
      confirmText: "Grant unlimited",
      onConfirm: () =>
        run(u.id, () => grantUnlimited({ userAccessId: u.id }), "Unlimited access granted"),
    })

  const confirmRevoke = (u: { id: Id<"userAccess">; email: string }) =>
    confirm({
      title: "Revoke access?",
      description: `${u.email} will immediately lose access to the suite. Their data is untouched and you can restore access at any time.`,
      confirmText: "Revoke access",
      variant: "destructive",
      onConfirm: () =>
        run(u.id, () => revoke({ userAccessId: u.id }), "Access revoked"),
    })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Active users</CardTitle>
        </div>
        <CardDescription>People who have accepted an invitation.</CardDescription>
      </CardHeader>
      <CardContent>
        {users === undefined ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const unlimited = u.accessExpiresAt === null
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>{statusBadge(u.status)}</TableCell>
                      <TableCell>
                        {unlimited ? (
                          <Badge variant="secondary" className="gap-1">
                            <Infinity className="h-3 w-3" />
                            Unlimited
                          </Badge>
                        ) : (
                          formatDate(u.accessExpiresAt)
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {u.status === "revoked" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === u.id}
                              onClick={() =>
                                run(u.id, () => restore({ userAccessId: u.id }), "Access restored")
                              }
                              title="Un-revoke — reactivate with the existing window"
                            >
                              Restore
                            </Button>
                          ) : (
                            <>
                              {!unlimited && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === u.id}
                                    onClick={() =>
                                      run(u.id, () => extend({ userAccessId: u.id, days: 90 }), "Extended 90 days")
                                    }
                                  >
                                    +90d
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === u.id}
                                    onClick={() =>
                                      run(u.id, () => renew({ userAccessId: u.id, days: 90 }), "Access renewed")
                                    }
                                    title="Start a fresh 90-day window from today"
                                  >
                                    Renew
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === u.id}
                                    onClick={() => confirmUnlimited(u)}
                                    title="Remove the expiry lock — access never expires"
                                  >
                                    <Infinity className="mr-1 h-4 w-4" />
                                    Unlimited
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                disabled={busyId === u.id}
                                onClick={() => confirmRevoke(u)}
                              >
                                Revoke
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {modal}
      </CardContent>
    </Card>
  )
}

export default function AdminPage() {
  const access = useQuery(api.access.myAccess)

  if (access === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!access.isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="space-y-3 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
            <CardTitle>Administrator access required</CardTitle>
            <CardDescription>You don&apos;t have permission to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin</h1>
          <p className="text-muted-foreground">
            Manage invitations and access to the Red Cedar Suite.
          </p>
        </div>
        <InviteForm />
        <InvitationEmailCard adminEmail={access.email} />
        <InvitationsTable />
        <UsersTable />
      </div>
    </div>
  )
}
