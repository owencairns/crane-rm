"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  ChevronDown,
  Scale,
  ExternalLink,
  ScrollText,
  ShieldCheck,
  Calculator,
  CheckCircle2,
  Clock,
} from "lucide-react"
import Image from "next/image"
import { RequestLoginDialog } from "@/components/landing/request-login-dialog"
import {
  AR_BADGER_URL,
  AR_BADGER_PROMO_CODE,
  AR_BADGER_TRIAL_MONTHS,
} from "@/components/ar-badger-callout"

function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const animationRef = useRef<number>(0)
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let dpr = 1

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }

    resize()
    window.addEventListener("resize", resize)

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", handleMouseMove)

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }
    window.addEventListener("mouseleave", handleMouseLeave)

    const dotSpacing = 20
    const baseRadius = 1.2
    const maxRadius = 3
    const influenceRadius = 120

    const animate = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      timeRef.current += 0.008

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const cols = Math.ceil(width / dotSpacing) + 1
      const rows = Math.ceil(height / dotSpacing) + 1
      const offsetX = (width % dotSpacing) / 2
      const offsetY = (height % dotSpacing) / 2

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const baseX = offsetX + i * dotSpacing
          const baseY = offsetY + j * dotSpacing

          const swirlPhase = timeRef.current + (i * 0.15) + (j * 0.15)
          const swirlRadius = 3
          const swirlX = Math.cos(swirlPhase) * swirlRadius
          const swirlY = Math.sin(swirlPhase * 1.3) * swirlRadius

          const x = baseX + swirlX
          const y = baseY + swirlY

          const dx = mouseRef.current.x - x
          const dy = mouseRef.current.y - y
          const distance = Math.sqrt(dx * dx + dy * dy)

          let radius = baseRadius
          let opacity = 0.12

          if (distance < influenceRadius) {
            const factor = 1 - distance / influenceRadius
            const eased = factor * factor * (3 - 2 * factor)
            radius = baseRadius + (maxRadius - baseRadius) * eased
            opacity = 0.12 + 0.25 * eased
          }

          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(197, 82%, 36%, ${opacity})`
          ctx.fill()
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseleave", handleMouseLeave)
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}

function FloatingNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border/40 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Image
            src="/red-cedar-logo.svg"
            alt="Red Cedar Agency"
            width={28}
            height={28}
            className="h-6 w-auto"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="#tools" className="hidden sm:block">
            <Button variant="ghost" size="sm">Tools</Button>
          </Link>
          <a href="https://redcedaragency.com/contact-us" target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="gap-1.5">
              Contact
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <Link href="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <RequestLoginDialog>
            <Button size="sm">Request a Login</Button>
          </RequestLoginDialog>
        </div>
      </div>
    </nav>
  )
}

const HERO_FEATURES = [
  {
    name: "Redline",
    icon: ScrollText,
    description: "Reviews construction contracts and flags risky terms before you sign.",
  },
  {
    name: "SubProtect",
    icon: ShieldCheck,
    description: "Checks certificates of insurance actually meet your requirements.",
  },
  {
    name: "AuditGuard",
    icon: Calculator,
    description: "Estimates your year-end premium-audit exposure.",
  },
  {
    name: "Threshold Calculator",
    icon: Scale,
    description: "Shows which employees are worth a raise under CA dual wage rules.",
  },
]

function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20">
      <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/red-cedar-logo.svg"
              alt="Red Cedar Agency"
              width={80}
              height={80}
              className="h-20 w-auto"
            />
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.08] text-balance">
            Contractor Risk Management Tools{" "}
            <span className="text-primary">Driven by AI</span>
          </h1>
          <div className="mx-auto max-w-xl rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-sm divide-y divide-border/50 text-left">
            {HERO_FEATURES.map((f) => (
              <div key={f.name} className="flex items-start gap-4 p-4 sm:p-5">
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground leading-tight">{f.name}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <RequestLoginDialog>
            <Button size="lg" className="gap-2 h-12 px-8 text-base shadow-md hover:shadow-lg transition-shadow">
              Request a Login
              <ArrowRight className="w-4 h-4" />
            </Button>
          </RequestLoginDialog>
        </div>
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown className="w-6 h-6 text-muted-foreground/40" />
      </div>
    </section>
  )
}

interface ToolSpec {
  eyebrow: string
  name: string
  icon: typeof ScrollText
  tagline: string
  description: string
  bullets: string[]
  comingSoon?: boolean
}

const TOOLS: ToolSpec[] = [
  {
    eyebrow: "Contract Review",
    name: "Redline",
    icon: ScrollText,
    tagline: "Catch risky contract terms before you sign.",
    description:
      "Upload a construction subcontract and Redline surfaces unfavorable terms, missing protections, and liability exposures — each with cited evidence, a recommended action, and an overall risk score.",
    bullets: [
      "Flags indemnity, insurance, and payment provisions",
      "Every finding cites the exact contract language",
      "Risk score and prioritized recommendations",
    ],
  },
  {
    eyebrow: "Certificate Verification",
    name: "SubProtect",
    icon: ShieldCheck,
    tagline: "Make sure every COI actually meets your requirements.",
    description:
      "Drop in a certificate of insurance and the requirements it must satisfy. SubProtect cross-examines every limit, date, and endorsement and flags whatever falls short — so a bad cert never slips through.",
    bullets: [
      "Checks each requirement against the certificate",
      "Met, insufficient, missing, or needs-verification",
      "Evidence pulled straight from the COI",
    ],
  },
  {
    eyebrow: "Premium Audit",
    name: "AuditGuard",
    icon: Calculator,
    tagline: "Know your year-end audit exposure before it surprises you.",
    description:
      "Upload an in-force policy package and your projected financials, and AuditGuard estimates the additional premium you're likely to owe at audit — line by line, so there are no year-end surprises.",
    bullets: [
      "Projects additional premium per line of business",
      "Reads revenue, payroll, and class-code rating bases",
      "Turns audit guesswork into a clear estimate",
    ],
  },
  {
    eyebrow: "Dual Wage",
    name: "Threshold Calculator",
    icon: Scale,
    tagline: "Give your crew a raise and pay less for work comp.",
    description:
      "California splits construction classifications at an hourly wage threshold, and the code below it costs far more. Enter your crew and the calculator shows who sits close enough to the line that raising them saves more premium than the raise costs.",
    bullets: [
      "Current WCIRB thresholds for all 16 class code pairs",
      "Nets the work comp saved against the cost of the raise",
      "Run your whole crew before your work comp renews",
    ],
  },
]

function ToolsSection() {
  return (
    <section id="tools" className="relative py-32 px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Guaranteed to reduce your company&apos;s risk
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Our AI isn&apos;t generic — it&apos;s built by risk managers with decades of experience.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {TOOLS.map((tool) => (
            <div
              key={tool.name}
              className={`group relative p-8 rounded-3xl bg-card border shadow-sm transition-all duration-300 flex flex-col ${
                tool.comingSoon
                  ? "border-border/50"
                  : "border-border/60 hover:border-primary/30 hover:shadow-lg"
              }`}
            >
              {tool.comingSoon && (
                <span className="absolute top-6 right-6 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium">
                  <Clock className="w-3 h-3" />
                  Coming soon
                </span>
              )}
              <div className="flex items-center gap-4 mb-6">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                    tool.comingSoon
                      ? "bg-muted"
                      : "bg-primary/8 group-hover:bg-primary/12"
                  }`}
                >
                  <tool.icon
                    className={`w-7 h-7 ${
                      tool.comingSoon ? "text-muted-foreground" : "text-primary"
                    }`}
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {tool.eyebrow}
                  </p>
                  <h3 className="text-2xl font-bold text-foreground">{tool.name}</h3>
                </div>
              </div>

              <p className="text-lg font-medium text-foreground mb-2">{tool.tagline}</p>
              <p className="text-muted-foreground leading-relaxed mb-6">{tool.description}</p>

              <ul className="space-y-3 mb-8">
                {tool.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3 text-sm">
                    <CheckCircle2
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        tool.comingSoon ? "text-muted-foreground/50" : "text-primary"
                      }`}
                    />
                    <span className="text-muted-foreground">{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {tool.comingSoon ? (
                  <Button variant="outline" className="gap-2" disabled>
                    <Clock className="w-4 h-4" />
                    Coming soon
                  </Button>
                ) : (
                  <RequestLoginDialog>
                    <Button variant="outline" className="gap-2 group-hover:border-primary/40">
                      Get {tool.name}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </RequestLoginDialog>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center space-y-5">
          <p className="text-lg text-muted-foreground">
            Ready to put these tools to work for your team?
          </p>
          <RequestLoginDialog>
            <Button size="lg" className="gap-2 h-12 px-8 text-base shadow-md hover:shadow-lg transition-shadow">
              Request a Login
              <ArrowRight className="w-4 h-4" />
            </Button>
          </RequestLoginDialog>
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative p-12 sm:p-16 rounded-3xl bg-gradient-to-br from-primary/4 via-primary/8 to-primary/4 border border-primary/15">
          <div className="relative space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Free for 90 days. No strings attached.
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Red Cedar Insurance Agency offers the full suite free for 90 days — no
              credit card, no commitment. Reach out and we&apos;ll get your team set up.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <RequestLoginDialog>
                <Button size="lg" className="gap-2 h-12 px-8 text-base shadow-md hover:shadow-lg transition-shadow">
                  Request a Login
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </RequestLoginDialog>
              <Link href="/login">
                <Button variant="outline" size="lg" className="gap-2 h-12 px-8 text-base">
                  Log in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DisclaimerSection() {
  return (
    <section className="relative py-16 px-6 bg-muted/30">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center text-center gap-3 p-6 rounded-xl bg-card border border-border/60">
          <Scale className="w-5 h-5 text-muted-foreground" />
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Legal Disclaimer</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              We do not provide legal advice. The terms we highlight are recommendations
              to negotiate and discuss with your attorney. These tools are designed to assist
              in identifying potential areas of concern, but should not be considered a
              substitute for professional legal counsel.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              There is never a charge for Red Cedar Insurance Agency (RCIA) risk management
              tools. These tools are available to RCIA insurance clients and prospective
              clients only.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PartnerSection() {
  return (
    <section id="partner" className="relative pb-32 px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            Also worth a look
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Not ours, but our clients keep telling us it works.
          </p>
        </div>

        <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 p-8 sm:p-10">
          <div className="flex flex-col lg:flex-row lg:items-center gap-8">
            <div className="flex-1 space-y-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Accounts Receivable
              </p>
              <h3 className="text-2xl font-bold text-foreground">AR Badger</h3>
              <p className="text-muted-foreground leading-relaxed max-w-2xl">
                You did not start your company to be its collections department.
                AR Badger is an authorized QuickBooks plug-in that chases your
                past-due invoices for you. Contractors using it are saving 5 to
                30 hours a week and getting paid quicker.
              </p>
              <p className="text-sm text-foreground">
                Red Cedar Agency clients get{" "}
                <strong>{AR_BADGER_TRIAL_MONTHS} months free</strong> with code{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tracking-wide border">
                  {AR_BADGER_PROMO_CODE}
                </code>{" "}
                at checkout.
              </p>
            </div>
            <div className="shrink-0">
              <a
                href={AR_BADGER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-block"
              >
                <Button size="lg" variant="outline" className="gap-2 h-12 px-8 text-base">
                  Visit AR Badger
                  <ExternalLink className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <DotGrid />
      <FloatingNav />
      <main className="relative z-10">
        <HeroSection />
        <ToolsSection />
        <PartnerSection />
        <CTASection />
        <DisclaimerSection />
      </main>
    </div>
  )
}
