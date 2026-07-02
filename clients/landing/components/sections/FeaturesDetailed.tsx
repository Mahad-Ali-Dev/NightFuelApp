'use client';

import * as React from 'react';
import {
  Bot,
  Clock,
  Camera,
  Dumbbell,
  CalendarDays,
  Watch,
  Users,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GradientText } from '@/components/ui/gradient-text';

/**
 * FeaturesDetailed — the full feature catalogue, CLEAN edition.
 *
 * Every Zeitra feature grouped into eight clusters, rendered as flat white
 * cards: hairline border, one lime icon per cluster, features as quiet text
 * lines with a small lime dot. No glass, no spotlight, no gradient borders,
 * no per-feature icon chips, no image grid — whitespace and typography do the
 * work. Light-first; the same tokens keep it correct in dark.
 */

type Feature = { label: string; desc: string };

type Cluster = {
  id: string;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  features: Feature[];
};

const CLUSTERS: Cluster[] = [
  {
    id: 'ai-coaching',
    eyebrow: 'AI Coaching',
    title: 'Ria, your AI coach',
    icon: Bot,
    features: [
      { label: 'Chat coaching', desc: 'ask Ria anything, 24/7' },
      { label: 'Voice coaching', desc: 'talk it through hands-free' },
      { label: 'Personalized meal plans', desc: 'built around your day' },
      { label: 'Macro tracking', desc: 'protein, carbs & fat, dialed in' },
      { label: 'Plan generation', desc: 'fresh plans on tap' },
    ],
  },
  {
    id: 'chrono',
    eyebrow: 'Chrono-nutrition',
    title: 'Timed to your shift',
    icon: Clock,
    features: [
      { label: 'Meal timing', desc: 'fuel at the right hour' },
      { label: 'Caffeine cut-offs', desc: 'protect the sleep that matters' },
      { label: 'Training windows', desc: 'train when your body can' },
      { label: 'Sleep alignment', desc: 'wind-down set to clock-off' },
    ],
  },
  {
    id: 'nutrition',
    eyebrow: 'Nutrition',
    title: 'Log it in a snap',
    icon: Camera,
    features: [
      { label: 'AI photo logging', desc: 'snap a plate, get the macros' },
      { label: '8,600+ food database', desc: 'search anything' },
      { label: 'Barcode scanning', desc: 'packaged food in one tap' },
      { label: '300+ recipes', desc: 'shift-friendly meals' },
      { label: 'Grocery lists', desc: 'auto-built from your plan' },
      { label: 'Hydration & fasting', desc: 'windows around your shift' },
    ],
  },
  {
    id: 'training',
    eyebrow: 'Training',
    title: 'Move with a plan',
    icon: Dumbbell,
    features: [
      { label: 'Exercise library', desc: 'demo videos for every move' },
      { label: 'Muscle body-map', desc: 'interactive, male & female' },
      { label: 'Workout of the day', desc: 'ready when you are' },
      { label: 'Active-workout tracking', desc: 'live sets & reps' },
      { label: 'AI challenges', desc: '3 / 7 / 15 / 30-day plans' },
    ],
  },
  {
    id: 'womens-health',
    eyebrow: "Women's health",
    title: 'In sync with your cycle',
    icon: CalendarDays,
    features: [
      { label: 'Cycle calendar', desc: 'track every phase' },
      { label: 'Phase-adapted nutrition', desc: 'fuel that flexes' },
      { label: 'Phase-adapted training', desc: 'train with your rhythm' },
    ],
  },
  {
    id: 'wearables',
    eyebrow: 'Tracking & Wearables',
    title: 'Connect any device',
    icon: Watch,
    features: [
      { label: 'Apple Health', desc: 'two-way sync' },
      { label: 'Health Connect', desc: 'Android, covered' },
      { label: 'Any BLE wearable', desc: 'even the unbranded ones' },
      { label: 'HR, HRV, sleep & steps', desc: 'the numbers that matter' },
      { label: 'Body metrics & analytics', desc: 'trends that mean something' },
    ],
  },
  {
    id: 'community',
    eyebrow: 'Community & Coaching',
    title: 'Your Crew & real coaches',
    icon: Users,
    features: [
      { label: '“Crew” social feed', desc: 'share wins & stay accountable' },
      { label: 'Leaderboards', desc: 'friendly competition' },
      { label: 'Verified coaches', desc: 'a vetted marketplace' },
      { label: 'Coach dashboard', desc: 'pros manage clients' },
      { label: 'Real-time chat', desc: 'talk to your coach live' },
    ],
  },
  {
    id: 'personalization',
    eyebrow: 'Personalization',
    title: 'Made yours, secured',
    icon: Palette,
    features: [
      { label: '9 themes', desc: 'make the app your own' },
      { label: 'Smart reminders', desc: 'nudges that fit your day' },
      { label: 'Encyclopedia & how-tos', desc: 'the what and the why' },
      { label: 'Email, Google & Apple sign-in', desc: 'with OTP verification' },
    ],
  },
];

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const Icon = cluster.icon;
  return (
    <Reveal.Item as="li" className="h-full">
      <article className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-lime)]/45 hover:shadow-[0_18px_40px_-24px_rgba(15,23,20,0.18)] md:p-7">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-lime)]/12 text-[var(--color-lime-dark)]"
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              {cluster.eyebrow}
            </p>
            <h3 className="[font-family:var(--font-display)] text-xl font-bold leading-tight tracking-tight">
              {cluster.title}
            </h3>
          </div>
        </div>

        <ul className="mt-5 flex flex-1 flex-col gap-2.5">
          {cluster.features.map((f) => (
            <li key={f.label} className="flex items-baseline gap-2.5 text-[14px] leading-snug">
              <span
                className="mt-[1px] size-[5px] shrink-0 translate-y-[-2px] rounded-full bg-[var(--color-lime)]"
                aria-hidden="true"
              />
              <p className="min-w-0">
                <span className="font-semibold text-[var(--color-foreground)]">{f.label}</span>
                <span className="text-[var(--color-muted-foreground)]"> — {f.desc}</span>
              </p>
            </li>
          ))}
        </ul>
      </article>
    </Reveal.Item>
  );
}

export function FeaturesDetailed() {
  const totalFeatures = CLUSTERS.reduce((n, c) => n + c.features.length, 0);

  return (
    <SectionShell
      id="features"
      eyebrow="Everything Zeitra does"
      title={
        <>
          One app, <GradientText>every part</GradientText> of your day
        </>
      }
      subtitle="AI coaching, chrono-nutrition, training, your cycle, wearables and community — the whole toolkit, at a glance."
    >
      <Reveal
        as="ul"
        stagger
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5"
      >
        {CLUSTERS.map((cluster) => (
          <ClusterCard key={cluster.id} cluster={cluster} />
        ))}
      </Reveal>

      <Reveal y={12}>
        <p className="mt-10 text-center text-sm text-[var(--color-muted-foreground)]">
          {totalFeatures}+ features · one subscription · iOS + Android
        </p>
      </Reveal>
    </SectionShell>
  );
}
