import { ArrowUpRight, Badge as BadgeIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const AR_BADGER_URL = "https://arbadger.com"
/** Red Cedar's referral code. Must exist in AR Badger billing to work. */
export const AR_BADGER_PROMO_CODE = "REDCEDAR"
export const AR_BADGER_TRIAL_MONTHS = 6

/**
 * Cross-sell for AR Badger. It is not part of the Red Cedar suite and does
 * not live behind this login, so it always opens in a new tab and is styled
 * to read as a recommendation rather than a fourth tool.
 */
export function ArBadgerCallout({ className }: { className?: string }) {
  return (
    <a
      href={AR_BADGER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("block group", className)}
    >
      <Card className="relative h-full p-6 border-dashed transition-all hover:border-primary/40 hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600">
            <BadgeIcon className="h-6 w-6" />
          </div>
          <Badge variant="outline" className="text-xs font-normal">
            Partner tool
          </Badge>
        </div>
        <div className="mt-5 space-y-2">
          <h2 className="text-xl font-semibold text-foreground">AR Badger</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An authorized QuickBooks plug-in that runs your accounts receivable
            collections for you. Contractors using it save 5 to 30 hours a week
            chasing past-due invoices, and get paid quicker.
          </p>
        </div>
        <div className="mt-5 rounded-lg bg-primary/5 border border-primary/15 p-3">
          <p className="text-sm text-foreground">
            Red Cedar Agency clients get{" "}
            <strong>{AR_BADGER_TRIAL_MONTHS} months free</strong> with code{" "}
            <code className="rounded bg-background px-1.5 py-0.5 text-xs font-semibold tracking-wide border">
              {AR_BADGER_PROMO_CODE}
            </code>{" "}
            at checkout.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-1 text-sm font-medium text-primary">
          Visit AR Badger
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </Card>
    </a>
  )
}
