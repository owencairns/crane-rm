"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Lock } from "lucide-react"

/** Shows children only to agency staff (admins and agency-domain logins). */
export function AgentsOnly({ children }: { children: React.ReactNode }) {
  const access = useQuery(api.access.myAccess)
  if (access === undefined) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }
  if (!access.isAgent) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md p-8 text-center space-y-4">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">For Red Cedar agents</h1>
            <p className="text-sm text-muted-foreground">
              This tool is only available to Red Cedar staff accounts.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to the dashboard</Link>
          </Button>
        </Card>
      </div>
    )
  }
  return <>{children}</>
}
