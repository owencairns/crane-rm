"use client"

import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, ScrollText, ShieldCheck, Calculator, Scale } from "lucide-react"
import { cn } from "@/lib/utils"
import { AUDITGUARD_ENABLED } from "@/lib/features"
import { ArBadgerCallout } from "@/components/ar-badger-callout"

interface SuiteTool {
  key: string
  name: string
  tagline: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  available: boolean
  /** Gradient behind the art panel at the top of the tile. */
  panel: string
  /** Texture layered over the gradient (ruled paper, dots, graph paper). */
  pattern: string
  /** Icon sticker colors. */
  sticker: string
  /** Decoration drawn over the panel, themed to what the tool does. */
  art: React.ReactNode
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
    available: true,
    panel:
      "bg-gradient-to-br from-sky-50 to-blue-100",
    pattern:
      "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_13px,rgb(59_130_246/0.16)_13px,rgb(59_130_246/0.16)_14px)]",
    sticker: "text-blue-600",
    // A red pen stroke that strikes through the "contract" on hover.
    art: (
      <>
        <span className="absolute right-6 top-5 h-1.5 w-28 rounded-full bg-blue-300/50" />
        <span className="absolute right-6 top-9 h-1.5 w-20 rounded-full bg-blue-300/50" />
        <span className="absolute right-6 top-[2.4rem] h-[3px] w-0 -rotate-2 rounded-full bg-red-500 transition-all duration-500 group-hover:w-24" />
        <span className="absolute right-6 top-[3.25rem] h-1.5 w-24 rounded-full bg-blue-300/50" />
      </>
    ),
  },
  {
    key: "sub-protect",
    name: "SubProtect",
    tagline: "COI Verification",
    description:
      "Drop in a certificate of insurance and the requirements it must satisfy. We cross-examine every limit, date, and endorsement and flag anything that falls short.",
    href: "/sub-protect",
    icon: ShieldCheck,
    available: true,
    panel:
      "bg-gradient-to-br from-emerald-50 to-teal-100",
    pattern:
      "bg-[radial-gradient(rgb(16_185_129/0.22)_1.2px,transparent_1.2px)] bg-[length:14px_14px]",
    sticker: "text-emerald-600",
    // Checkmarks that tick on, one after another.
    art: (
      <div className="absolute right-6 top-1/2 flex -translate-y-1/2 gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ transitionDelay: `${i * 90}ms` }}
            className="grid h-7 w-7 place-items-center rounded-md bg-white/80 text-sm font-bold text-emerald-600 shadow-sm ring-1 ring-emerald-600/10 transition-transform duration-300 group-hover:-translate-y-1"
          >
            ✓
          </span>
        ))}
      </div>
    ),
  },
  {
    key: "audit-guard",
    name: "AuditGuard",
    tagline: "Premium Audit",
    description:
      "Upload an in-force policy package and projected financials to estimate the additional premium expected at year-end audit, line by line.",
    href: "/audit-guard",
    icon: Calculator,
    available: AUDITGUARD_ENABLED,
    panel:
      "bg-gradient-to-br from-amber-50 to-orange-100",
    pattern:
      "bg-[linear-gradient(rgb(245_158_11/0.14)_1px,transparent_1px),linear-gradient(90deg,rgb(245_158_11/0.14)_1px,transparent_1px)] bg-[length:14px_14px]",
    sticker: "text-amber-600",
    // A little bar chart that grows on hover.
    art: (
      <div className="absolute bottom-3 right-6 flex items-end gap-1.5">
        {[
          "h-5 group-hover:h-7",
          "h-8 group-hover:h-11",
          "h-6 group-hover:h-9",
          "h-10 group-hover:h-14",
        ].map((h, i) => (
          <span
            key={i}
            className={cn(
              "w-3.5 rounded-t-sm bg-amber-400/70 transition-all duration-300",
              h,
            )}
          />
        ))}
      </div>
    ),
  },
  {
    key: "threshold-calculator",
    name: "Threshold Calculator",
    tagline: "Dual Wage",
    description:
      "California's dual wage class codes split your rate at an hourly threshold. Find out which employees are worth a raise, because the work comp savings can beat the cost.",
    href: "/threshold-calculator",
    icon: Scale,
    available: true,
    panel:
      "bg-gradient-to-br from-violet-50 to-fuchsia-100",
    pattern:
      "bg-[repeating-linear-gradient(135deg,transparent_0,transparent_9px,rgb(139_92_246/0.1)_9px,rgb(139_92_246/0.1)_11px)]",
    sticker: "text-violet-600",
    // A seesaw that tips toward the savings side on hover.
    art: (
      <div className="absolute right-6 top-1/2 -translate-y-1/2">
        <div className="relative h-12 w-32">
          <div className="absolute inset-x-0 top-4 flex origin-center -rotate-6 items-end justify-between transition-transform duration-500 group-hover:rotate-6">
            <span className="-mb-px rounded-md bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 shadow-sm">
              raise
            </span>
            <span className="-mb-px rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              savings
            </span>
          </div>
          <span className="absolute inset-x-0 top-[2.15rem] mx-auto h-[3px] w-full origin-center -rotate-6 rounded-full bg-violet-400 transition-transform duration-500 group-hover:rotate-6" />
          <span className="absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-b-[10px] border-x-transparent border-b-violet-400" />
        </div>
      </div>
    ),
  },
]

function ToolTile({ tool }: { tool: SuiteTool }) {
  const Icon = tool.icon
  const card = (
    <Card
      className={cn(
        "group relative flex h-full flex-col overflow-hidden p-0 transition-all duration-300",
        tool.available
          ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:border-primary/30"
          : "opacity-60",
      )}
    >
      <div className={cn("relative h-20 overflow-hidden border-b border-border/60", tool.panel)}>
        <div className={cn("absolute inset-0", tool.pattern)} />
        {tool.art}
        <div
          className={cn(
            "absolute left-5 top-1/2 -translate-y-1/2 -rotate-6 rounded-2xl bg-white p-2.5 shadow-md ring-1 ring-black/5 transition-transform duration-300 group-hover:rotate-0 group-hover:scale-110",
            tool.sticker,
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        {!tool.available && (
          <Badge variant="secondary" className="absolute right-3 top-3">
            Coming soon
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">{tool.name}</h3>
          <Badge variant="outline" className="text-[11px] font-normal">
            {tool.tagline}
          </Badge>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {tool.description}
        </p>
        {tool.available && (
          <div className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-primary">
            Open
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        )}
      </div>
    </Card>
  )

  return tool.available ? (
    <Link href={tool.href} className="block h-full">
      {card}
    </Link>
  ) : (
    <div className="h-full">{card}</div>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

export default function SuiteHomePage() {
  const { user } = useAuth()
  const firstName = user?.displayName?.split(" ")[0]

  return (
    <div className="bg-muted/30 p-6 sm:p-8 min-h-full">
      <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>

        <section className="space-y-4">
          <SectionHeading
            title="Red Cedar tools"
            subtitle="Risk management tools built for contractors, included with your login."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <ToolTile key={tool.key} tool={tool} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading
            title="Some apps we recommend"
            subtitle="Outside tools we trust. They open in a new tab."
          />
          <ArBadgerCallout />
        </section>
      </div>
    </div>
  )
}
