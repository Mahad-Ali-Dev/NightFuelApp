'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Moon, Sunrise, Coffee, Dumbbell, Utensils } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientText } from '@/components/ui/gradient-text';
import { StatCounter } from '@/components/ui/stat-counter';

/**
 * Science — chrono-nutrition credibility. Explains circadian timing simply and
 * shows how Zeitra maps it onto a real rota. Left: a CSS/SVG circadian clock
 * graphic with orbiting markers. Right: plain-language explainer + supporting
 * points, then a credibility stat strip. Premium, trustworthy, dark.
 */

type Point = {
  icon: React.ElementType;
  title: string;
  body: string;
};

const POINTS: Point[] = [
  {
    icon: Utensils,
    title: 'When you eat is a signal',
    body: 'Meal timing sets your metabolic clock. Eat against your body clock and the same food lands differently — Zeitra times it to your shift, not a textbook 9-to-5.',
  },
  {
    icon: Dumbbell,
    title: 'Train with your rhythm',
    body: 'Strength, output and recovery all swing across the day. Zeitra schedules training into the windows your real rota actually leaves open.',
  },
  {
    icon: Coffee,
    title: 'Caffeine & sleep, on a cut-off',
    body: 'Late caffeine and mistimed light wreck the sleep you need most after a night shift. Zeitra sets your cut-offs and wind-down around when you clock off.',
  },
];

/** Markers arranged around the 24h dial (angle in degrees, 0 = top / midnight). */
const DIAL = [
  { icon: Moon, label: 'Sleep', angle: 12 },
  { icon: Sunrise, label: 'Wake', angle: 108 },
  { icon: Utensils, label: 'Fuel', angle: 168 },
  { icon: Coffee, label: 'Cut-off', angle: 228 },
  { icon: Dumbbell, label: 'Train', angle: 300 },
];

const R = 132; // orbit radius inside the 320 viewBox
const C = 160; // center

function polar(angle: number, radius: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(rad), y: C + radius * Math.sin(rad) };
}

function CircadianClock() {
  const reduce = useReducedMotion();
  const circumference = 2 * Math.PI * R;

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      {/* ambient glow behind the dial */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 blur-2xl"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 45%, rgba(168,204,60,0.22), transparent 70%)',
        }}
      />

      <div
        className="glass gradient-border relative aspect-square w-full overflow-hidden rounded-[var(--radius-2xl)] p-6"
        role="img"
        aria-label="A 24-hour circadian dial showing Zeitra scheduling sleep, wake, fuel, caffeine cut-off and training around a shift."
      >
        <div className="grid-bg absolute inset-0 opacity-50" aria-hidden="true" />

        <svg
          viewBox="0 0 320 320"
          className="relative h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sci-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a8cc3c" />
              <stop offset="55%" stopColor="#00d4aa" />
              <stop offset="100%" stopColor="#a8cc3c" stopOpacity="0.35" />
            </linearGradient>
            <radialGradient id="sci-core" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="rgba(168,204,60,0.30)" />
              <stop offset="100%" stopColor="rgba(168,204,60,0)" />
            </radialGradient>
          </defs>

          {/* faint track */}
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1.5"
          />

          {/* hour ticks */}
          {Array.from({ length: 24 }).map((_, i) => {
            const a = polar(i * 15, R + 12);
            const b = polar(i * 15, i % 6 === 0 ? R + 2 : R + 7);
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={i % 6 === 0 ? 2 : 1}
              />
            );
          })}

          {/* active arc — the "planned day" */}
          <motion.circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="url(#sci-ring)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={reduce ? undefined : { strokeDashoffset: circumference }}
            whileInView={reduce ? undefined : { strokeDashoffset: circumference * 0.28 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: '50% 50%', rotate: -8 }}
          />

          {/* center core wash */}
          <circle cx={C} cy={C} r="58" fill="url(#sci-core)" />
        </svg>

        {/* center label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-muted-foreground)]">
            Your day
          </span>
          <span className="mt-1 [font-family:var(--font-display)] text-4xl font-bold leading-none">
            <GradientText>24H</GradientText>
          </span>
          <span className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
            timed to your rota
          </span>
        </div>

        {/* orbiting markers positioned over the box as % of the 320 viewBox */}
        {DIAL.map((m, i) => {
          const p = polar(m.angle, R);
          const Icon = m.icon;
          const left = (p.x / 320) * 100;
          const top = (p.y / 320) * 100;
          return (
            <motion.div
              key={m.label}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
              initial={reduce ? undefined : { opacity: 0, scale: 0.6 }}
              whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: 0.4 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="flex size-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-panel-2)] text-[var(--color-lime)] shadow-[0_8px_24px_-10px_rgba(0,0,0,0.8)]">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-foreground)]/80 backdrop-blur">
                  {m.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function Science() {
  return (
    <SectionShell
      id="science"
      align="left"
      eyebrow="The science"
      title={
        <>
          Chrono-nutrition, built around{' '}
          <GradientText>your real clock</GradientText>
        </>
      }
      subtitle="Circadian science shows that WHEN you eat, train and sleep changes metabolism, recovery and sleep quality — especially when your schedule fights your body clock."
      decoration={
        <>
          <div
            className="glow"
            style={{ width: 560, height: 560, top: -120, right: -160 }}
            aria-hidden="true"
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Left: the clock graphic */}
        <Reveal y={28}>
          <CircadianClock />
        </Reveal>

        {/* Right: explainer + supporting points */}
        <div className="flex flex-col gap-6">
          <Reveal y={24}>
            <p className="text-lg leading-relaxed text-[var(--color-muted-foreground)]">
              Most apps hand everyone the same 9-to-5 plan. Zeitra{' '}
              <span className="font-semibold text-[var(--color-foreground)]">
                operationalizes chrono-nutrition around YOUR rota
              </span>{' '}
              — so your meals, caffeine, training and wind-down land at the right
              hour for the day you&apos;re actually working.
            </p>
          </Reveal>

          <Reveal as="ul" stagger className="flex flex-col gap-4">
            {POINTS.map((p) => {
              const Icon = p.icon;
              return (
                <Reveal.Item as="li" key={p.title}>
                  <GlowCard as="div" spotlight className="flex gap-4 p-5">
                    <span
                      className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-lime)]"
                      aria-hidden="true"
                    >
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold leading-tight">
                        {p.title}
                      </h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
                        {p.body}
                      </p>
                    </div>
                  </GlowCard>
                </Reveal.Item>
              );
            })}
          </Reveal>
        </div>
      </div>

      {/* Credibility stat strip */}
      <Reveal y={24} className="mt-12 md:mt-16">
        <GlowCard as="div" hover={false} className="p-6 md:p-8">
          <dl className="grid grid-cols-1 gap-8 text-center sm:grid-cols-3 sm:text-left">
            <div>
              <dt className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Shift workers worldwide
              </dt>
              <dd className="mt-2 [font-family:var(--font-display)] text-4xl font-bold md:text-5xl">
                <StatCounter
                  value={1.8}
                  decimals={1}
                  suffix="B"
                  className="text-[var(--color-lime)]"
                />
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Timing points aligned daily
              </dt>
              <dd className="mt-2 [font-family:var(--font-display)] text-4xl font-bold md:text-5xl">
                <StatCounter value={5} className="text-[var(--color-lime)]" />
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Textbook 9-to-5s assumed
              </dt>
              <dd className="mt-2 [font-family:var(--font-display)] text-4xl font-bold md:text-5xl">
                <StatCounter value={0} className="text-[var(--color-lime)]" />
              </dd>
            </div>
          </dl>
        </GlowCard>
      </Reveal>
    </SectionShell>
  );
}
