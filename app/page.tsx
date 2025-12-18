"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, FileSearch, Shield, Zap, ChevronDown, FileText, Scale, ExternalLink } from "lucide-react"
import Image from "next/image"

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

          // Swirl animation - each dot moves in a small circular pattern
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
          ctx.fillStyle = `hsla(221, 83%, 53%, ${opacity})`
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
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
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
        <div className="flex items-center gap-3">
          <Image
            src="/red-cedar-logo.svg"
            alt="Red Cedar Agency"
            width={40}
            height={40}
            className="h-10 w-auto"
          />
          <div className="hidden sm:block">
            <span className="font-semibold text-foreground">Crane Risk Management</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://redcedaragency.com/contact-us"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="gap-1.5">
              Contact
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/login">
            <Button size="sm">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/red-cedar-logo.svg"
              alt="Red Cedar Agency"
              width={80}
              height={80}
              className="h-20 w-auto"
            />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Zap className="w-3.5 h-3.5" />
              A Red Cedar Insurance Agency Product
            </div>
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            Crane Risk
            <br />
            <span className="text-primary">Management</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Customized tools developed to assist Crane companies in reducing their risk
            through contract analysis and other risk management techniques.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/login">
            <Button size="lg" className="gap-2 h-12 px-8 text-base">
              Start 60-Day Free Trial
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="#features">
            <Button variant="outline" size="lg" className="gap-2 h-12 px-8 text-base">
              Learn More
            </Button>
          </Link>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            60-Day Free Trial
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            No Credit Card Required
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown className="w-6 h-6 text-muted-foreground/50" />
      </div>
    </section>
  )
}

function FeaturesSection() {
  const features = [
    {
      icon: Shield,
      title: "Risk Identification",
      description:
        "Automatically identify potential risks, unfavorable terms, and liability exposures specific to crane operations before they become costly problems.",
    },
    {
      icon: Zap,
      title: "Instant Results",
      description:
        "Upload your contracts and receive detailed analysis within seconds. Get actionable recommendations to discuss with your attorney.",
    },
  ]

  return (
    <section id="features" className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Contract Analysis Built for Crane Companies
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powerful risk management tools designed specifically for the crane industry.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative p-8 rounded-2xl bg-card border border-border/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative p-12 sm:p-16 rounded-3xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-primary/20">
          <div className="absolute inset-0 rounded-3xl overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          </div>

          <div className="relative space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Start Your 60-Day Free Trial
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              No credit card required. Get full access to all contract analysis features
              and start reducing your risk today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link href="/login">
                <Button size="lg" className="gap-2 h-12 px-8 text-base">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a
                href="https://redcedaragency.com/contact-us"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="lg" className="gap-2 h-12 px-8 text-base">
                  Contact Us
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
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
        <div className="flex items-start gap-4 p-6 rounded-xl bg-card border border-border/60">
          <div className="shrink-0 mt-0.5">
            <Scale className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Legal Disclaimer</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We do not provide legal advice. The terms we highlight are recommendations
              to negotiate and discuss with your attorney. This tool is designed to assist
              in identifying potential areas of concern, but should not be considered a
              substitute for professional legal counsel.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="relative border-t border-border/40 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src="/red-cedar-logo.svg"
              alt="Red Cedar Agency"
              width={32}
              height={32}
              className="h-8 w-auto"
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                Crane Risk Management
              </span>
              <p className="text-xs text-muted-foreground">
                A Red Cedar Insurance Agency Product
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="https://redcedaragency.com/contact-us"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact Us
            </a>
            <a
              href="https://redcedaragency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Red Cedar Agency
            </a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 text-center">
          <p className="text-xs text-muted-foreground">
            CraneRM.com - Contract analysis and risk management tools for the crane industry
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <DotGrid />
      <FloatingNav />
      <main className="relative z-10">
        <HeroSection />
        <FeaturesSection />
        <CTASection />
        <DisclaimerSection />
      </main>
      <Footer />
    </div>
  )
}
