import { ProtectedRoute } from "@/components/ProtectedRoute"
import { AppNav } from "@/components/layout/AppNav"

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div className="h-screen flex flex-col overflow-hidden">
        <AppNav />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ProtectedRoute>
  )
}
