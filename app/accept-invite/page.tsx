"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg animate-slide-up">
        <CardHeader className="space-y-4">
          <Link href="/" className="flex flex-col items-center gap-3">
            <Image src="/red-cedar-logo.svg" alt="Red Cedar Agency" width={60} height={60} className="h-15 w-auto" />
            <div className="text-center">
              <h1 className="font-bold text-lg text-foreground">Red Cedar Suite</h1>
              <p className="text-xs text-muted-foreground">by Red Cedar Insurance Agency</p>
            </div>
          </Link>
          {children}
        </CardHeader>
      </Card>
    </div>
  )
}

function StatusCard({
  icon,
  title,
  description,
  footer,
}: {
  icon: React.ReactNode
  title: string
  description: string
  footer?: React.ReactNode
}) {
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 pt-2">
        {icon}
        <div className="space-y-1 text-center">
          <CardTitle className="text-xl font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
      {footer && <CardFooter className="pt-4">{footer}</CardFooter>}
    </Shell>
  )
}

function AcceptInviteInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const router = useRouter()
  const { signUp, user } = useAuth()

  const invite = useQuery(api.invitations.getByToken, token ? { token } : "skip")
  const acceptInvite = useMutation(api.invitations.accept)

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)

  const acceptWithRetry = async () => {
    // After sign-up the Convex auth token can lag a beat: the mutation may
    // briefly see no identity ("unauthorized") or a stale one ("different
    // email address"). Both converge to the just-created invitee, so retry.
    const transient = (msg: string) =>
      msg.includes("unauthorized") || msg.includes("different email address")
    let lastErr: unknown
    for (let i = 0; i < 10; i++) {
      try {
        await acceptInvite({ token })
        return
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message.toLowerCase() : ""
        if (!transient(msg)) throw err
        await sleep(500)
      }
    }
    throw lastErr
  }

  if (!token) {
    return (
      <StatusCard
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Invalid link"
        description="This invitation link is missing its token. Please use the link from your invitation email."
        footer={
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        }
      />
    )
  }

  if (invite === undefined) {
    return (
      <StatusCard
        icon={<Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />}
        title="Checking your invitation"
        description="One moment…"
      />
    )
  }

  if (!invite.found) {
    return (
      <StatusCard
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Invitation not found"
        description="This invitation link is not valid. Ask your administrator to send a new one."
        footer={
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        }
      />
    )
  }

  if (invite.status === "revoked") {
    return (
      <StatusCard
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Invitation revoked"
        description="This invitation has been revoked. Please contact your administrator."
      />
    )
  }

  if (invite.status === "accepted") {
    return (
      <StatusCard
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-600" />}
        title="Already accepted"
        description="This invitation has already been used. You can sign in with your account."
        footer={
          <Button asChild className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        }
      />
    )
  }

  if (invite.linkExpired) {
    return (
      <StatusCard
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Invitation expired"
        description="This invitation link has expired. Ask your administrator to resend it."
      />
    )
  }

  // Valid + pending. If the visitor already has a matching account, let them
  // accept directly; otherwise have them set a password to create one.
  const alreadySignedInMatch =
    !!user && user.email.toLowerCase() === invite.email.toLowerCase()

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!alreadySignedInMatch) {
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters.")
        return
      }
      if (password !== confirm) {
        toast.error("Passwords don't match.")
        return
      }
    }
    setLoading(true)
    try {
      if (!alreadySignedInMatch) {
        await signUp(invite.email, password)
      }
      await acceptWithRetry()
      toast.success("Welcome to the Red Cedar Suite!")
      router.push("/dashboard")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept invitation.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell>
      <div className="space-y-1 pt-2">
        <div className="flex justify-center pb-2">
          <ShieldCheck className="h-9 w-9 text-emerald-600" />
        </div>
        <CardTitle className="text-2xl font-bold text-center">Accept your invitation</CardTitle>
        <CardDescription className="text-center">
          {alreadySignedInMatch
            ? "You're signed in. Confirm to activate your access."
            : "Set a password to finish creating your account."}
        </CardDescription>
      </div>
      <CardContent className="space-y-4 pt-4">
        {invite.message && (
          <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground whitespace-pre-line">
            {invite.message}
          </p>
        )}
        <form onSubmit={handleAccept} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={invite.email} disabled readOnly />
          </div>
          {!alreadySignedInMatch && (
            <>
              <div className="space-y-2">
                <Label htmlFor="password">Create password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Your access will be valid for {invite.accessWindowDays} days from today.
          </p>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Setting up…" : "Accept invitation"}
          </Button>
        </form>
      </CardContent>
    </Shell>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <StatusCard
          icon={<Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />}
          title="Loading"
          description="One moment…"
        />
      }
    >
      <AcceptInviteInner />
    </Suspense>
  )
}
