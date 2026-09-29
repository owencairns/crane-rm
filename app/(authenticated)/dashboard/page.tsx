"use client"

import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, ScrollText, ShieldCheck, Calculator, Scale } from "lucide-react"
import { AUDITGUARD_ENABLED } from "@/lib/features"
import { ArBadgerCallout } from "@/components/ar-badger-callout"

interface SuiteTool {
  key: string
  name: string
  tagline: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  available: boolean
}

const TOOLS: SuiteTool[] = [
  {
    key: "redliner",
    name: "Redliner",
    tagline: "Contract Review",
    description:
      "Upload a construction subcontract and surface missing or risky insurance provisions, with cited evidence and a risk score.",
    href: "/redliner",
    icon: ScrollText,
    accent: "bg-blue-500/10 text-blue-600",
    available: true,
  },
  {
    key: "sub-protect",
    name: "SubProtect",
    tagline: "COI Verification",
    description:
      "Drop in a certificate of insurance and the requirements it must satisfy. We cross-examine every limit, date, and endorsement and flag anything that falls short.",
    href: "/sub-protect",
    icon: ShieldCheck,
    accent: "bg-emerald-500/10 text-emerald-600",
    available: true,
  },
  {
    key: "audit-guard",
    name: "AuditGuard",
    tagline: "Premium Audit",
    description:
      "Upload an in-force policy package and projected financials to estimate the additional premium expected at year-end audit, line by line.",
    href: "/audit-guard",
    icon: Calculator,
    accent: "bg-amber-500/10 text-amber-600",
    available: AUDITGUARD_ENABLED,
  },
  {
    key: "threshold-calculator",
    name: "Threshold Calculator",
    tagline: "Dual Wage",
    description:
      "California's dual wage class codes split your rate at an hourly threshold. Work out which employees are worth a raise, because the work comp you save can exceed what the raise costs.",
    href: "/threshold-calculator",
    icon: Scale,
    accent: "bg-violet-500/10 text-violet-600",
    available: true,
  },
]

export default function SuiteHomePage() {
  const { user } = useAuth()
  const firstName = user?.displayName?.split(" ")[0]

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="text-muted-foreground">
            Choose a tool from the Red Cedar suite to get started.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            const card = (
              <Card
                className={`group relative h-full p-6 transition-all ${
                  tool.available
                    ? "hover:border-primary/40 hover:shadow-md cursor-pointer"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl ${tool.accent}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {!tool.available && <Badge variant="secondary">Coming soon</Badge>}
                </div>
                <div className="mt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-foreground">{tool.name}</h2>
                    <Badge variant="outline" className="text-xs font-normal">
                      {tool.tagline}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tool.description}
                  </p>
                </div>
                {tool.available && (
                  <div className="mt-6 flex items-center gap-1 text-sm font-medium text-primary">
                    Open
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                )}
              </Card>
            )

            return tool.available ? (
              <Link key={tool.key} href={tool.href} className="block h-full">
                {card}
              </Link>
            ) : (
              <div key={tool.key} className="h-full">
                {card}
              </div>
            )
          })}
          <ArBadgerCallout className="h-full" />
        </div>
      </div>
    </div>
  )
}
