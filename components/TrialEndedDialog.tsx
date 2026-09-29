"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import Image from "next/image"
import { ArrowUpRight, Mail } from "lucide-react"
import { cn } from "@/lib/utils"

const MAILTO =
  "mailto:info@redcedaragency.com" +
  "?subject=" +
  encodeURIComponent("CertMaster access — continuing after my trial") +
  "&body=" +
  encodeURIComponent(
    "Hi Chris,\n\nMy 90-day CertMaster trial has ended and I'd like to talk about keeping access going.\n\nThanks!"
  )

const CONTACT_URL = "https://redcedaragency.com/contact-us"

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

/**
 * Non-dismissible trial-ended modal. Expired users have no way into the app,
 * so there is no close affordance and no escape/outside-click dismissal — the
 * only paths forward are getting in touch with Red Cedar or signing out.
 */
export function TrialEndedDialog({
  expiresAt,
  onSignOut,
}: {
  expiresAt?: number
  onSignOut: () => void
}) {
  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-300" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%]",
            "overflow-hidden rounded-2xl shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-300",
            "bg-[hsl(197_82%_15%)] text-white"
          )}
        >
          {/* Ambient brand glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[hsl(197_82%_36%)] opacity-30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-[hsl(82_38%_29%)] opacity-30 blur-3xl"
          />

          <div className="relative px-7 pt-8 pb-7">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Image
                  src="/red-cedar-logo.svg"
                  alt="Red Cedar"
                  width={22}
                  height={22}
                  className="h-5 w-5"
                />
              </span>
              <span className="text-sm font-medium tracking-wide text-white/70">
                CertMaster
              </span>
            </div>

            <DialogPrimitive.Title className="mt-6 font-serif text-[1.7rem] leading-tight tracking-tight">
              Your{" "}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">90-day trial</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 z-0 h-2 bg-[hsl(197_82%_36%)]/60"
                />
              </span>{" "}
              has ended
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="mt-3 text-[0.95rem] leading-relaxed text-white/70">
              Thanks for trying CertMaster. Let&rsquo;s talk about keeping you
              going — reach out to Chris and the Red Cedar team to discuss
              continued access.
            </DialogPrimitive.Description>

            {expiresAt && (
              <p className="mt-5 inline-flex items-center rounded-full bg-white/8 px-3 py-1 text-xs text-white/60 ring-1 ring-white/10">
                Trial ended {formatDate(expiresAt)}
              </p>
            )}

            <div className="mt-7 space-y-3">
              <a
                href={MAILTO}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(40_38%_92%)] px-5 py-3.5 text-[0.95rem] font-semibold text-[hsl(197_82%_15%)] shadow-sm transition hover:bg-[hsl(40_45%_95%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Mail className="h-4 w-4" />
                Get in touch with Red Cedar
              </a>

              <a
                href={CONTACT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white/85 transition hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Visit our contact page
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-6 border-t border-white/10 pt-4 text-center">
              <button
                type="button"
                onClick={onSignOut}
                className="text-xs text-white/45 underline-offset-4 transition hover:text-white/70 hover:underline focus:outline-none"
              >
                Sign out
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
