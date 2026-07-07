'use client';

import * as React from 'react';
import { Clock, Users, LayoutGrid, MoonStar, ArrowRight } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientText } from '@/components/ui/gradient-text';
import { Reveal } from '@/components/ui/reveal';
import { StatCounter } from '@/components/ui/stat-counter';

/**
 * Problem — the market gap. Contrasts the "9-to-5 apps" world against the
 * real lives of shift workers and women on a cycle, then lands 4 sharp pain
 * points. Includes a lifestyle image in a glass frame + a punchy stat.
 */

const PAINS = [
  {
    icon: Clock,
    title: 'Timing-blind advice',
    body:
      'Eat at 8am, train at 6pm, sleep at 11. Great — if your day looks like a spreadsheet. Rotating and night shifts break every assumption these apps are built on.',
  },
  {
    icon: Users,
    title: 'One-size-fits-none plans',
    body:
      'The same generic macros for a night-shift nurse, a marathoner and a woman mid-cycle. No schedule awareness, no cycle adaptation — a template that fits no one.',
  },
  {
    icon: LayoutGrid,
    title: 'Fragmented across 4–5 apps',
    body:
      'One app to log food, another for workouts, a watch app, a recipe app, a coach elsewhere. Your fitness life is scattered and nothing talks to anything.',
  },
  {
    icon: MoonStar,
    title: 'Punished for working nights',
    body:
      'Log a 2am meal and mainstream trackers flag you as "off plan." Your body is doing exactly what it should — the app just never learned your clock exists.',
  },
] as const;

export function Problem() {
  return (
    <SectionShell
      id="problem"
      align="center"
      eyebrow="The gap"
      title={
        <>
          Built for a clock <GradientText>most people don&rsquo;t work</GradientText>
        </>
      }
      subtitle="MyFitnessPal, Noom and every mainstream tracker quietly assume a 9-to-5. If your life doesn't fit that box, their advice doesn't fit you."
      decoration={
        <>
          <div
            className="glow"
            aria-hidden="true"
            style={{ width: 520, height: 520, top: -120, right: -80 }}
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      {/* Contrast strip: 9-to-5 world vs your real life */}
      <Reveal className="mb-10 md:mb-14">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
          <GlowCard hover={false} className="p-6 md:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              What the 9-to-5 apps assume
            </p>
            <p className="mt-3 text-2xl md:text-3xl font-semibold leading-[1.12] tracking-[-0.01em] [font-family:var(--font-display)] text-[var(--color-muted-foreground)]">
              Same hours.
              <br />
              Same body.
              <br />
              Every single day.
            </p>
          </GlowCard>

          <div
            className="flex items-center justify-center py-2 md:py-0"
            aria-hidden="true"
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--hairline)] text-[var(--color-lime)] backdrop-blur">
              <ArrowRight className="size-5 rotate-90 md:rotate-0" />
            </span>
          </div>

          <GlowCard highlight className="p-6 md:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-lime-dark)] dark:text-[var(--color-lime-light)]">
              What your life actually looks like
            </p>
            <p className="mt-3 text-2xl md:text-3xl font-semibold leading-[1.12] tracking-[-0.01em] [font-family:var(--font-display)]">
              Nights. Earlies.
              <br />
              Doubles. Cycles.
              <br />
              A clock all your own.
            </p>
          </GlowCard>
        </div>
      </Reveal>

      {/* Pain points grid */}
      <Reveal
        as="ul"
        stagger
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {PAINS.map(({ icon: Icon, title, body }) => (
          <Reveal.Item as="li" key={title} className="h-full">
            <GlowCard as="div" spotlight className="flex h-full flex-col p-6">
              <span className="flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--hairline)] text-[var(--color-lime)]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[var(--color-foreground)]">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                {body}
              </p>
            </GlowCard>
          </Reveal.Item>
        ))}
      </Reveal>

      {/* Closing: lifestyle image + the stat that names who's left out */}
      <Reveal className="mt-6" delay={0.05}>
        <GlowCard hover={false} className="overflow-hidden p-0">
          <div className="grid items-stretch gap-0 md:grid-cols-[1.05fr_1fr]">
            {/* Image slot — glass/gradient bg so a missing file still reads intentionally */}
            <div className="relative min-h-[240px] overflow-hidden md:min-h-full">
              <div
                aria-hidden="true"
                className="absolute inset-0 [background:radial-gradient(120%_120%_at_20%_0%,rgba(168,204,60,0.16),transparent_55%),linear-gradient(160deg,var(--color-panel-2),var(--color-panel))]"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/lifestyle-nurse.webp"
                alt="A night-shift nurse checking her plan on her phone during a break"
                loading="lazy"
                className="relative h-full w-full object-cover opacity-95"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent to-[var(--color-panel)]/60 md:to-[var(--color-panel)]"
              />
            </div>

            <div className="flex flex-col justify-center gap-4 p-7 md:p-10">
              <p className="text-2xl md:text-3xl font-semibold uppercase leading-[1.05] [font-family:var(--font-display)]">
                <GradientText>
                  <StatCounter value={1.8} decimals={1} suffix="B" />
                </GradientText>{' '}
                shift workers the mainstream apps forget.
              </p>
              <p className="text-base leading-relaxed text-[var(--color-muted-foreground)]">
                Nurses, paramedics, logistics and hospitality crews — plus
                everyone syncing training to a cycle instead of a calendar.
                Zeitra is built for the people the 9-to-5 apps quietly designed
                around.
              </p>
            </div>
          </div>
        </GlowCard>
      </Reveal>
    </SectionShell>
  );
}
