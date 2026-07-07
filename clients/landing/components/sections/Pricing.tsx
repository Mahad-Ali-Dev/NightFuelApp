'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Ban,
} from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { GlowCard } from '@/components/ui/glow-card';
import { Reveal } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GradientText } from '@/components/ui/gradient-text';
import { cn } from '@/lib/utils';

type Billing = 'monthly' | 'annual';

/** Everything is in the one plan — no tiers, no paywalled features. */
const INCLUDED: string[] = [
  'AI coach "Ria" — chat + voice',
  'Chrono-nutrition timing engine',
  'AI photo meal-logging + barcode',
  '8,600+ food database',
  '300+ recipes',
  'Workouts + interactive muscle map',
  'AI challenges (3/7/15/30-day)',
  'Any-wearable Bluetooth sync',
  'Apple Health & Health Connect',
  'Community "Crew" & accountability',
  'Verified coaching marketplace',
  'Real-time chat & smart reminders',
];

const ASSURANCES: { icon: React.ReactNode; label: string }[] = [
  { icon: <ShieldCheck className="size-4" aria-hidden="true" />, label: '7-day free trial' },
  { icon: <CreditCard className="size-4" aria-hidden="true" />, label: 'No card-surprise billing' },
  { icon: <Ban className="size-4" aria-hidden="true" />, label: 'Cancel anytime' },
];

export function Pricing() {
  const reduce = useReducedMotion();
  const [billing, setBilling] = React.useState<Billing>('annual');
  const annual = billing === 'annual';

  return (
    <SectionShell
      id="pricing"
      eyebrow="Pricing"
      title={
        <>
          One plan. <GradientText>Every feature.</GradientText>
        </>
      }
      subtitle="Start with a 7-day free trial, then keep everything for the price of a couple of coffees. No tiers, no locked features, cancel anytime."
      decoration={
        <>
          <div
            className="glow"
            aria-hidden="true"
            style={{ width: 620, height: 620, top: '18%', left: '50%', transform: 'translateX(-50%)' }}
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      {/* Billing toggle */}
      <Reveal className="mb-10 flex flex-col items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Choose billing period"
          className="glass inline-flex items-center gap-1 rounded-full p-1"
        >
          {(['monthly', 'annual'] as Billing[]).map((b) => {
            const active = billing === b;
            return (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBilling(b)}
                className={cn(
                  'relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold capitalize',
                  'transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lime)]',
                  active
                    ? 'text-[var(--color-ink)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                )}
              >
                {active && (
                  <motion.span
                    layoutId={reduce ? undefined : 'billing-pill'}
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-full bg-[var(--color-lime)] shadow-[0_10px_30px_-10px_rgba(168,204,60,0.6)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{b}</span>
                {b === 'annual' && (
                  <span
                    className={cn(
                      'relative rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      active
                        ? 'bg-[var(--color-ink)]/15 text-[var(--color-ink)]'
                        : 'bg-[var(--color-lime)]/15 text-[var(--color-lime-light)]',
                    )}
                  >
                    Save ~50%
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {annual ? 'Billed once a year — best value.' : 'Flexible month-to-month.'}
        </p>
      </Reveal>

      {/* Pricing card + feature list */}
      <Reveal
        as="div"
        className="mx-auto grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
      >
        {/* Price panel */}
        <GlowCard highlight spotlight className="flex flex-col p-8 md:p-10">
          <div className="mb-6 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              Zeitra {annual ? 'Annual' : 'Monthly'}
            </span>
            <Badge variant="lime">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {annual ? 'Founding member' : 'Full access'}
            </Badge>
          </div>

          <div className="flex items-end gap-2">
            <span
              className="text-6xl font-bold leading-none md:text-7xl [font-family:var(--font-display)]"
              aria-label={annual ? '59 dollars per year' : '9 dollars 99 cents per month'}
            >
              <span aria-hidden="true" className="align-super text-3xl text-[var(--color-lime)]">
                $
              </span>
              <span aria-hidden="true" className="text-[var(--color-foreground)]">
                {annual ? '59' : '9.99'}
              </span>
            </span>
            <span className="mb-2 text-lg text-[var(--color-muted-foreground)]">
              /{annual ? 'yr' : 'mo'}
            </span>
          </div>

          <p className="mt-2 min-h-[1.5rem] text-sm text-[var(--color-lime-light)]">
            {annual ? 'Just $4.92/mo — save ~50% vs monthly.' : 'Switch to annual and save ~50%.'}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Button size="lg" className="w-full">
              <Sparkles className="size-5" aria-hidden="true" />
              Start 7-day free trial
            </Button>
            <Button as="a" href="#waitlist" variant="secondary" size="lg" className="w-full">
              Join the waitlist
            </Button>
          </div>

          <p className="mt-4 text-center text-xs text-[var(--color-muted-foreground)]">
            7-day free trial · iOS &amp; Android · cancel anytime
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[var(--color-border)] pt-6">
            {ASSURANCES.map((a) => (
              <span
                key={a.label}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]"
              >
                <span className="text-[var(--color-lime)]">{a.icon}</span>
                {a.label}
              </span>
            ))}
          </div>
        </GlowCard>

        {/* Included features */}
        <GlowCard hover={false} className="flex flex-col p-8 md:p-10">
          <h3 className="text-xl font-bold uppercase tracking-tight md:text-2xl">
            Everything&apos;s <GradientText>included</GradientText>
          </h3>
          <p className="mt-1.5 text-sm text-[var(--color-muted-foreground)]">
            One plan unlocks the entire product — no add-ons, no upsells.
          </p>

          <Reveal
            as="ul"
            stagger
            className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
          >
            {INCLUDED.map((feature) => (
              <Reveal.Item
                as="li"
                key={feature}
                y={12}
                className="flex items-start gap-2.5 text-sm text-[var(--color-foreground)]/90"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-lime)]/12 text-[var(--color-lime)] ring-1 ring-[var(--color-lime)]/25"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span className="leading-snug">{feature}</span>
              </Reveal.Item>
            ))}
          </Reveal>
        </GlowCard>
      </Reveal>
    </SectionShell>
  );
}
