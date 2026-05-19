"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "convex/react"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
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
import { toast } from "sonner"
import { UserPlus, Loader2 } from "lucide-react"
import { api } from "@/convex/_generated/api"

function SignupInner() {
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const router = useRouter()

  const validation = useQuery(api.invites.validate, token ? { token } : "skip")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error("Passwords don't match")
      return
    }
    setLoading(true)
    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name: name || email.split("@")[0],
        inviteToken: token,
      } as Parameters<typeof authClient.signUp.email>[0] & { inviteToken: string })
      if (result.error) {
        throw new Error(result.error.message || "Failed to create account")
      }
      toast.success("Account created!")
      router.push("/dashboard")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed")
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <StatusCard
        title="Sign-up is invite-only"
        body="You'll need a valid invite link to create an account. Contact your Red Cedar administrator."
      />
    )
  }

  if (validation === undefined) {
    return (
      <StatusCard
        title="Checking your invite…"
        body={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      />
    )
  }

  if (validation.status !== "valid") {
    const messages: Record<string, string> = {
      invalid: "We couldn't find that invite. Double-check the link or ask for a new one.",
      revoked: "This invite has been revoked. Ask your administrator for a new link.",
      consumed: "This invite has already been used. Ask your administrator for a new link.",
      expired: "This invite has expired. Ask your administrator for a new link.",
    }
    return <StatusCard title="Invite unavailable" body={messages[validation.status]} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg animate-slide-up">
        <CardHeader className="space-y-4">
          <Link href="/" className="flex flex-col items-center gap-1">
            <h1 className="font-bold text-2xl tracking-tight text-foreground">Redline</h1>
            <p className="text-xs text-muted-foreground">by Red Cedar Insurance Agency</p>
          </Link>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Create your account</CardTitle>
            <CardDescription className="text-center">
              {validation.note
                ? `You've been invited: ${validation.note}`
                : "You've been invited to Redline."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                aria-invalid={
                  confirmPassword.length > 0 && password !== confirmPassword
                }
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords don&apos;t match</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <UserPlus className="mr-2 h-4 w-4" />
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <Link href="/" className="flex flex-col items-center gap-1">
            <h1 className="font-bold text-2xl tracking-tight text-foreground">Redline</h1>
            <p className="text-xs text-muted-foreground">by Red Cedar Insurance Agency</p>
          </Link>
          <CardTitle className="text-xl font-bold text-center pt-4">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {body}
          <div className="pt-6">
            <Link href="/login" className="text-primary hover:underline text-sm">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  )
}
