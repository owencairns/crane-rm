"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldAlert } from "lucide-react"
import { TrialEndedDialog } from "@/components/TrialEndedDialog"

/**
 * Authorization gate for the suite. Sits inside ProtectedRoute (so the user is
 * already authenticated) and blocks the tools unless the user has an active
 * access grant or is an admin. Expired/never-granted users see a friendly wall
 * — their data is untouched, access just needs to be (re)granted by an admin.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth()
  const access = useQuery(api.access.myAccess)

  if (access === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Checking access…</p>
        </div>
      </div>
    )
  }

  if (access.state === "admin" || access.state === "active") {
    return <>{children}</>
  }

  const expired = access.state === "expired"
  const revoked = access.state === "revoked"

  if (expired) {
    return (
      <div className="min-h-[70vh] bg-muted/30">
        <TrialEndedDialog
          expiresAt={access.expiresAt ?? undefined}
          onSignOut={() => signOut()}
        />
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg animate-slide-up">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-1 text-center">
            <CardTitle className="text-xl font-bold">
              {revoked ? "Your access has been paused" : "No active access"}
            </CardTitle>
            <CardDescription>
              {revoked
                ? "An administrator has paused your access. Please reach out to them to restore it."
                : "Your account isn't linked to an active invitation yet. Please contact your administrator."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {access.expiresAt && (
            <p className="text-center text-xs text-muted-foreground mb-4">
              Valid until{" "}
              {new Date(access.expiresAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
          <Button variant="outline" className="w-full" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
