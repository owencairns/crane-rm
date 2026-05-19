"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.users.current)
  const router = useRouter()

  useEffect(() => {
    if (me === null || (me && !me.isAdmin)) {
      router.replace("/dashboard")
    }
  }, [me, router])

  if (me === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (!me?.isAdmin) return null

  return <>{children}</>
}
