'use client';

import * as React from 'react';
import { CalendarClock, Sparkles, Camera, ArrowRight } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientText } from '@/components/ui/gradient-text';
import { DeviceFrame } from '@/components/ui/device-frame';
import { Button } from '@/components/ui/button';

/**
 * HowItWorks — the 3-step onboarding narrative. A connected, stepped visual
 * with oversized lime step numerals, an icon, copy, and a phone frame per step.
 * Scroll-revealed via the shared Reveal primitive; reduced-motion safe.
 */

interface Step {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  caption: string;
  /** Real on-device screen shown in the step's phone. */
  screen: string;
  alt: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    icon: <CalendarClock className="size-6" aria-hidden="true" />,
    title: 'Tell Zeitra your shifts & goals',
    body: 'Set your real rota — nights, rotating, split or on-call — plus your goals. No pretending you work 9-to-5.',
    caption: 'Your shift pattern',
    screen: '/images/app/sleep-window.webp',
    alt: 'Zeitra preferences — setting a sleep window and circadian rhythm around a shift',
  },
  {
    n: '02',
    icon: <Sparkles className="size-6" aria-hidden="true" />,
    title: 'Ria builds your timed plan',
    body: 'Your AI coach times meals, training, caffeine and sleep around your clock — chrono-nutrition, done for you.',
    caption: 'Ria plans your day',
    screen: '/images/app/rhythm.webp',
    alt: 'Zeitra — the “your rhythm tonight” timeline Ria builds for the shift',
  },
  {
    n: '03',
    icon: <Camera className="size-6" aria-hidden="true" />,
    title: 'Log by photo, sync, adapt',
    body: 'Snap a plate to log it, sync any watch, and Zeitra adapts your plan every single day as life shifts.',
    caption: 'Log & adapt',
    screen: '/images/app/log-meal.webp',
    alt: 'Zeitra — logging a meal by snapping a plate or scanning a barcode',
  },
];

export function HowItWorks() {
  return (
    <SectionShell
      id="how"
      eyebrow="How it works"
      title={
        <>
          Set up in minutes, <GradientText>timed for life</GradientText>
        </>
      }
      subtitle="Three steps from your first shift to a plan that moves with you."
      decoration={
        <>
          <div
            className="glow"
            style={{ width: 620, height: 620, left: '-8%', top: '20%' }}
            aria-hidden="true"
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal
        as="ul"
        stagger
        className="relative grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-8"
      >
        {/* Connector line linking the step numerals across the row (md+ only). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[16%] top-[3.25rem] hidden h-px md:block"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(168,204,60,0.5) 15%, rgba(0,212,170,0.4) 85%, transparent)',
          }}
        />

        {STEPS.map((step, i) => (
          <Reveal.Item as="li" key={step.n} className="relative">
            <GlowCard spotlight className="flex h-full flex-col gap-6 p-6 sm:p-8">
              {/* Numeral + icon row */}
              <div className="flex items-center justify-between gap-4">
                <span
                  className="text-6xl font-bold leading-none text-[var(--color-lime)] [font-family:var(--font-display)] [text-shadow:0_0_40px_rgba(168,204,60,0.35)]"
                  aria-hidden="true"
                >
                  {step.n}
                </span>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-[var(--color-border-strong)] bg-white/[0.04] text-[var(--color-lime)]">
                  {step.icon}
                </span>
              </div>

              {/* Copy */}
              <div className="flex flex-col gap-2.5">
                <h3 className="text-2xl font-semibold uppercase leading-tight [font-family:var(--font-display)]">
                  <span className="sr-only">{`Step ${i + 1}: `}</span>
                  {step.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {step.body}
                </p>
              </div>

              {/* Phone frame */}
              <div className="mt-auto flex justify-center pt-2">
                <DeviceFrame
                  width={200}
                  caption={step.caption}
                  src={step.screen}
                  alt={step.alt}
                />
              </div>
            </GlowCard>

            {/* Chevron between cards on wide screens */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 text-[var(--color-lime)]/60 lg:block"
              >
                <ArrowRight className="size-6" />
              </span>
            )}
          </Reveal.Item>
        ))}
      </Reveal>

      {/* Close-out CTA */}
      <Reveal
        delay={0.15}
        className="mt-12 flex flex-col items-center gap-4 text-center md:mt-16"
      >
        <p className="text-lg text-[var(--color-muted-foreground)]">
          That&apos;s it. Your coach is ready before your next shift starts.
        </p>
        <Button as="a" href="#waitlist" variant="primary" size="lg">
          Get started free
          <ArrowRight className="size-5" aria-hidden="true" />
        </Button>
        <span className="text-sm text-[var(--color-muted-foreground)]">
          7-day free trial · iOS &amp; Android
        </span>
      </Reveal>
    </SectionShell>
  );
}
