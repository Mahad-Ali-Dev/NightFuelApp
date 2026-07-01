import * as React from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';

import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { Badge } from '@/components/ui/badge';
import { GradientText } from '@/components/ui/gradient-text';
import { AppBadges } from '@/components/ui/app-badges';
import { DotPattern } from '@/components/ui/dot-pattern';
import { PricingComparison } from '@/components/ui/pricing-comparison';

/**
 * PricingSection — wraps the Zeitra-adapted <PricingComparison/> as the visual
 * centerpiece inside a SectionShell (#pricing) with an ambient DotPattern
 * texture + lime glows behind it, then a 7-day-trial reassurance + AppBadges
 * CTA row beneath. Light/dark aware — all colors come from --color-* tokens.
 *
 * Server-safe: SectionShell/Reveal carry their own client boundaries and the
 * imported pieces are all SSR-friendly, so no top-level "use client" is needed.
 */
export function PricingSection() {
  return (
    <SectionShell
      id="pricing"
      eyebrow="Pricing"
      title={
        <>
          One plan. <GradientText>Every feature.</GradientText>
        </>
      }
      subtitle="No confusing tiers, no paywalled essentials. Start with a 7-day free trial, then unlock everything Zeitra does for the price of a couple of coffees."
      decoration={
        <>
          {/* Ambient DotPattern texture (theme-aware fill already). */}
          <DotPattern
            aria-hidden="true"
            width={26}
            height={26}
            cx={1}
            cy={1}
            cr={1}
            className="[mask-image:radial-gradient(680px_circle_at_center,white,transparent)] opacity-70"
          />
          {/* Lime + cyan ambient glows. */}
          <div
            className="glow"
            aria-hidden="true"
            style={{ width: 560, height: 560, top: '4%', left: '-12%' }}
          />
          <div
            className="glow glow-cyan"
            aria-hidden="true"
            style={{ width: 460, height: 460, bottom: '2%', right: '-10%' }}
          />
        </>
      }
    >
      {/* Centerpiece: the Zeitra-adapted comparison table, lifted onto glass. */}
      <Reveal>
        <div className="relative mx-auto max-w-5xl">
          <div className="glass gradient-border rounded-3xl p-4 sm:p-6 md:p-10 shadow-[0_40px_120px_-60px_rgba(168,204,60,0.35)]">
            <PricingComparison />
          </div>
        </div>
      </Reveal>

      {/* 7-day trial reassurance + store CTAs. */}
      <Reveal delay={0.08}>
        <div className="mx-auto mt-12 max-w-3xl">
          <div className="glass gradient-border relative overflow-hidden rounded-3xl px-6 py-8 md:px-10 md:py-9">
            <div
              className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-[var(--color-lime)]/25 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:justify-between md:gap-10 md:text-left">
              <div className="flex flex-col items-center gap-3 md:items-start">
                <Badge variant="lime">
                  <Sparkles aria-hidden="true" /> 7-day free trial
                </Badge>
                <p className="max-w-md text-lg font-semibold leading-snug text-[var(--color-foreground)]">
                  Try every feature free for a week.{' '}
                  <span className="text-[var(--color-muted-foreground)] font-medium">
                    Then $9.99/mo or $59/yr — cancel anytime.
                  </span>
                </p>
                <p className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)]">
                  <ShieldCheck
                    className="size-4 text-[var(--color-lime)]"
                    aria-hidden="true"
                  />
                  No commitment, no card charged during the trial.
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-center gap-3 md:items-end">
                <AppBadges className="justify-center md:justify-end" />
                <a
                  href="#waitlist"
                  className="text-sm font-medium text-[var(--color-muted-foreground)] underline-offset-4 transition-colors hover:text-[var(--color-lime)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lime)] rounded"
                >
                  Or join the launch waitlist &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}

export default PricingSection;
