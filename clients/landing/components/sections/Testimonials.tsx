'use client';

import * as React from 'react';
import { Quote, Star } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { GlowCard } from '@/components/ui/glow-card';
import { Reveal } from '@/components/ui/reveal';
import { GradientText } from '@/components/ui/gradient-text';
import { StatCounter } from '@/components/ui/stat-counter';

/**
 * Testimonials — illustrative, persona-attributed quotes (no fake names/logos).
 * Masonry-style column layout with lime star accents, glass GlowCards and a
 * lime rating stat strip. Client component: uses Reveal / GlowCard / StatCounter
 * (all reduced-motion aware).
 */

interface Testimonial {
  quote: React.ReactNode;
  persona: string;
  context: string;
  initials: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Every other app assumed I ate lunch at noon. Zeitra finally gets that "noon" for me is 3am. My energy on nights is a different world now.',
    persona: 'Night-shift ICU nurse',
    context: '4-on / 4-off rotation',
    initials: 'ICU',
  },
  {
    quote:
      'My roster changes every week and the timing engine just rolls with it. Ria re-plans my meals and caffeine around the next block without me touching anything.',
    persona: 'Rotating-roster paramedic',
    context: 'Variable shift pattern',
    initials: 'RP',
  },
  {
    quote:
      'Training synced to my cycle plus feeding a newborn at odd hours — this is the first app that treats my clock as the real one instead of fighting it.',
    persona: 'Marathoner + new mum',
    context: 'Cycle-aware training',
    initials: 'MM',
  },
  {
    quote:
      'I snap a photo of the plate, my old fitness band pairs over Bluetooth, and it all lands in one place. Five apps down to one.',
    persona: 'Warehouse team lead',
    context: 'Any-wearable sync',
    initials: 'WL',
  },
];

/** Split into two balanced columns for a light masonry feel on desktop. */
const COLUMNS: Testimonial[][] = [
  [TESTIMONIALS[0], TESTIMONIALS[2]],
  [TESTIMONIALS[1], TESTIMONIALS[3]],
];

function Stars() {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label="Rated 5 out of 5"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className="size-4 fill-[var(--color-lime)] text-[var(--color-lime)]"
        />
      ))}
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <GlowCard as="article" spotlight className="p-6 md:p-7">
      <Quote
        aria-hidden="true"
        className="mb-4 size-8 text-[var(--color-lime)]/40"
      />
      <blockquote className="text-base md:text-lg leading-relaxed text-[var(--color-foreground)]/90">
        {t.quote}
      </blockquote>
      <div className="mt-6 flex items-center gap-3 border-t border-[var(--color-border)] pt-5">
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-lime)]/25 bg-[var(--color-lime)]/10 text-xs font-bold tracking-wide text-[var(--color-lime-light)]"
        >
          {t.initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--color-foreground)]">
            {t.persona}
          </div>
          <div className="truncate text-xs text-[var(--color-muted-foreground)]">
            {t.context}
          </div>
        </div>
        <div className="ml-auto">
          <Stars />
        </div>
      </div>
    </GlowCard>
  );
}

export function Testimonials() {
  return (
    <SectionShell
      id="testimonials"
      eyebrow="From the floor"
      title={
        <>
          Built for the shifts the{' '}
          <GradientText>9-to-5 apps forget</GradientText>
        </>
      }
      subtitle="Illustrative stories from the people mainstream apps leave out — nurses, paramedics, athletes and everyone whose clock doesn't fit a textbook."
      decoration={
        <>
          <div
            className="glow"
            style={{
              width: '620px',
              height: '620px',
              top: '-160px',
              right: '-140px',
            }}
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal
        as="ul"
        stagger
        className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start"
      >
        {COLUMNS.map((column, ci) => (
          <Reveal.Item
            as="li"
            key={ci}
            className="flex flex-col gap-6 md:[&:nth-child(2)]:mt-12"
          >
            {column.map((t) => (
              <TestimonialCard key={t.persona} t={t} />
            ))}
          </Reveal.Item>
        ))}
      </Reveal>

      {/* Rating stat strip */}
      <Reveal delay={0.1} className="mt-12 md:mt-16">
        <GlowCard className="flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:justify-center sm:gap-12 sm:text-left">
          <div className="flex items-center gap-3">
            <Stars />
            <span className="text-2xl font-bold text-[var(--color-foreground)] [font-family:var(--font-display)]">
              <StatCounter value={4.9} decimals={1} />
              <span className="text-[var(--color-muted-foreground)]">/5</span>
            </span>
          </div>
          <div className="hidden h-8 w-px bg-[var(--color-border)] sm:block" />
          <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
            Loved by early testers across{' '}
            <span className="font-semibold text-[var(--color-lime)]">
              healthcare, logistics and endurance sport
            </span>{' '}
            — the clock-first crowd.
          </p>
        </GlowCard>
      </Reveal>
    </SectionShell>
  );
}
