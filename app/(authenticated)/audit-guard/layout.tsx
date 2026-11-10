import { AUDITGUARD_ENABLED } from "@/lib/features"
import { ComingSoon } from "@/components/ComingSoon"

export default function AuditGuardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!AUDITGUARD_ENABLED) {
    return <ComingSoon title="AuditGuard" />
  }
  return <>{children}</>
}
