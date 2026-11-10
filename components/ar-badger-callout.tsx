import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

export const AR_BADGER_URL = "https://arbadger.com"
/** Red Cedar's referral code. Must exist in AR Badger billing to work. */
export const AR_BADGER_PROMO_CODE = "REDCEDAR"
export const AR_BADGER_TRIAL_MONTHS = 6

/**
 * Cross-sell for AR Badger. It is not part of the Red Cedar suite and does
 * not live behind this login, so it always opens in a new tab. It wears AR
 * Badger's own brand (charcoal, cream, badger brown, QuickBooks green) so it
 * reads as a partner app rather than a Red Cedar tool.
 */
export function ArBadgerCallout({ className }: { className?: string }) {
  return (
    <a
      href={AR_BADGER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative block overflow-hidden rounded-2xl bg-[#2b2416] text-[#f2dfae] shadow-md ring-1 ring-black/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        className,
      )}
    >
      {/* Warm glow behind the badger, echoing the mascot art. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_50%,#7a6a3e_0%,#4a3f24_35%,transparent_70%)]" />

      {/* The running badger. Faint behind the text on phones, sprints on hover. */}
      <Image
        src="/partners/ar-badger/badger-running.png"
        alt=""
        width={560}
        height={560}
        className="pointer-events-none absolute -right-6 top-1/2 h-[120%] w-auto -translate-y-1/2 opacity-15 transition-transform duration-500 group-hover:translate-x-3 group-hover:-rotate-2 sm:opacity-100"
      />

      <div className="relative max-w-xl p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <Image
            src="/partners/ar-badger/icon.png"
            alt="AR Badger"
            width={48}
            height={48}
            className="h-12 w-12 rounded-full bg-[#f2dfae] p-0.5 transition-transform duration-300 group-hover:-rotate-12"
          />
          <span className="text-2xl font-black uppercase tracking-wide">AR Badger</span>
          <span className="rounded-full bg-[#2CA01C] px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Works with QuickBooks
          </span>
        </div>

        <p className="mt-4 text-[15px] font-semibold leading-snug text-[#f8ecc9]">
          Stop chasing invoices. The badger does it for you.
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#f2dfae]/75">
          An authorized QuickBooks plug-in that runs your accounts receivable
          follow-up on its own. Contractors using it save 5 to 30 hours a week
          and get paid quicker.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#f2dfae]/50 bg-[#f2dfae]/10 px-3 py-2 text-[13px]">
            <span>
              Red Cedar clients get{" "}
              <strong className="text-white">{AR_BADGER_TRIAL_MONTHS} months free</strong>
            </span>
            <code className="rounded bg-[#f2dfae] px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-[#2b2416]">
              {AR_BADGER_PROMO_CODE}
            </code>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#f2dfae] px-3.5 py-2 text-sm font-semibold text-[#2b2416] transition-colors group-hover:bg-white">
            Visit AR Badger
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </a>
  )
}
