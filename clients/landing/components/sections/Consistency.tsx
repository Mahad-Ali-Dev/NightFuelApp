'use client';

import * as React from 'react';
import { Flame, CalendarCheck, TrendingUp, Moon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientText } from '@/components/ui/gradient-text';
import { StatCounter } from '@/components/ui/stat-counter';
import {
  ContributionGraph,
  ContributionGraphGrid,
  ContributionGraphLegend,
  type ContributionData,
  type ContributionLevel,
} from '@/components/ui/contribution-graph';

/**
 * Consistency — "your rhythm, tracked". The chrono-nutrition/workout adherence
 * heatmap (contribution-graph) is the visual centerpiece: a ~6-month lime streak
 * showing how Zeitra builds a consistent rhythm around irregular shifts. All
 * data is generated deterministically in-component (no Math.random / new Date)
 * so the static export is stable. Light/dark aware via --contribution-* vars.
 */

const START_DATE = '2026-01-01';
const END_DATE = '2026-06-30';

/** Advance a `YYYY-MM-DD` string by `days` days (UTC, no `new Date(now)`). */
function addDays(startISO: string, days: number): string {
  const [y, m, d] = startISO.split('-').map(Number);
  // Date.UTC is deterministic (no ambient "now"); fixed inputs → fixed output.
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = `${dt.getUTCMonth() + 1}`.padStart(2, '0');
  const dd = `${dt.getUTCDate()}`.padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Days between two fixed ISO dates (inclusive of start, exclusive of end+1). */
function daySpan(startISO: string, endISO: string): number {
  const [ay, am, ad] = startISO.split('-').map(Number);
  const [by, bm, bd] = endISO.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/**
 * Deterministic adherence heatmap. Count varies by index in a fixed pattern
 * that reads like a real, improving-but-imperfect streak: it trends up over the
 * span, dips on a repeating "off/rest day" cadence, and never uses randomness.
 */
function buildAdherenceData(): ContributionData[] {
  const total = daySpan(START_DATE, END_DATE) + 1; // inclusive
  const data: ContributionData[] = [];

  for (let i = 0; i < total; i += 1) {
    // Base wave from the required formula, 0..5.
    const base = (i * 7 + 3) % 6;
    // Gentle upward trend so the streak "warms up" toward the present.
    const trend = Math.floor(i / 45); // +1 roughly every 6 weeks
    // A recurring rest/rotation day where adherence intentionally drops.
    const isRest = i % 13 === 0;

    let count = isRest ? base % 2 : base + trend;
    if (count > 5) count = 5;
    if (count < 0) count = 0;

    // Map count → explicit lime level so the palette is stable and legible.
    const level = (count === 0
      ? 0
      : count <= 1
        ? 1
        : count <= 3
          ? 2
          : count <= 4
            ? 3
            : 4) as ContributionLevel;

    data.push({ date: addDays(START_DATE, i), count, level });
  }

  return data;
}

type Stat = {
  icon: LucideIcon;
  value: number;
  suffix?: string;
  label: string;
};

const STATS: Stat[] = [
  { icon: Flame, value: 41, label: 'Longest streak, in days' },
  { icon: CalendarCheck, value: 6, label: 'Months of tracked rhythm' },
  { icon: TrendingUp, value: 87, suffix: '%', label: 'Plan adherence, on average' },
];

type Point = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const POINTS: Point[] = [
  {
    icon: Moon,
    title: 'Streaks that survive night shifts',
    body: 'A rotating rota breaks most habit trackers. Zeitra counts a day as done when you hit YOUR plan for that shift — so a 3am dinner still keeps the streak alive.',
  },
  {
    icon: TrendingUp,
    title: 'See the rhythm build',
    body: 'Every logged meal, workout and wind-down colours a square. Months of small wins stack into a picture you can actually feel proud of.',
  },
];

export function Consistency() {
  const data = React.useMemo(() => buildAdherenceData(), []);

  return (
    <SectionShell
      id="consistency"
      align="left"
      eyebrow="Consistency"
      title={
        <>
          Your rhythm, <GradientText>tracked</GradientText>
        </>
      }
      subtitle="Irregular shifts make consistency feel impossible. Zeitra turns every logged meal, workout and wind-down into a streak that adapts to the day you're actually working — so the rhythm builds even when your schedule doesn't."
      decoration={
        <>
          <div
            className="glow"
            style={{ width: 620, height: 620, top: -160, left: -180 }}
            aria-hidden="true"
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <div className="flex flex-col gap-10 lg:gap-12">
        {/* Centerpiece: the adherence heatmap */}
        <Reveal y={28}>
          <GlowCard as="div" hover={false} className="p-5 sm:p-7 md:p-9">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="[font-family:var(--font-display)] text-2xl font-bold uppercase leading-none sm:text-3xl">
                  6 months of showing up
                </h3>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  Jan – Jun 2026 · chrono-nutrition &amp; workout adherence
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-lime)]/30 bg-[var(--color-lime)]/10 px-3 py-1.5 text-sm font-semibold text-[var(--color-lime-light)]">
                <Flame className="size-4" aria-hidden="true" />
                41-day best streak
              </div>
            </div>

            <ContributionGraph
              data={data}
              startDate={START_DATE}
              endDate={END_DATE}
              className="w-full"
            >
              <ContributionGraphGrid
                aria-label="Heatmap of daily Zeitra adherence from January to June 2026, brighter squares meaning fully on-plan days."
                className="pb-1"
              />
              <ContributionGraphLegend
                className="mt-4"
                lessLabel="Off plan"
                moreLabel="On plan"
              />
            </ContributionGraph>
          </GlowCard>
        </Reveal>

        {/* Supporting: stat strip + explainer points */}
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
          {/* Stat strip */}
          <Reveal y={24} className="lg:col-span-2">
            <GlowCard as="div" hover={false} className="h-full p-6 md:p-7">
              <dl className="flex h-full flex-col justify-center gap-7">
                {STATS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center gap-4">
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-lime)]"
                        aria-hidden="true"
                      >
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <dd className="[font-family:var(--font-display)] text-3xl font-bold leading-none md:text-4xl">
                          <StatCounter
                            value={s.value}
                            suffix={s.suffix}
                            className="text-[var(--color-lime)]"
                          />
                        </dd>
                        <dt className="mt-1.5 text-sm text-[var(--color-muted-foreground)]">
                          {s.label}
                        </dt>
                      </div>
                    </div>
                  );
                })}
              </dl>
            </GlowCard>
          </Reveal>

          {/* Explainer points */}
          <Reveal as="ul" stagger className="flex flex-col gap-6 lg:col-span-3">
            {POINTS.map((p) => {
              const Icon = p.icon;
              return (
                <Reveal.Item as="li" key={p.title}>
                  <GlowCard as="div" spotlight className="flex gap-4 p-6">
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
    </SectionShell>
  );
}
