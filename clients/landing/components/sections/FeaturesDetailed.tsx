'use client';

import * as React from 'react';
import {
  Bot,
  MessageSquare,
  Mic,
  Sparkles,
  Target,
  Clock,
  Coffee,
  Moon,
  Dumbbell,
  Camera,
  Database,
  ScanBarcode,
  BookOpen,
  ShoppingCart,
  Droplets,
  Timer,
  PlayCircle,
  PersonStanding,
  CalendarDays,
  Trophy,
  Flame,
  HeartPulse,
  Watch,
  Bluetooth,
  Activity,
  Ruler,
  LineChart,
  Users,
  Medal,
  BadgeCheck,
  LayoutDashboard,
  Palette,
  Bell,
  GraduationCap,
  Mail,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientText } from '@/components/ui/gradient-text';
import { ShuffleGrid } from '@/components/ui/shuffle-grid';

/**
 * FeaturesDetailed — the COMPREHENSIVE feature catalogue. Every Zeitra feature,
 * grouped into eight labelled clusters, each rendered as a GlowCard with a lucide
 * icon + a tight line of features. Below the clusters: the auto-shuffling
 * <ShuffleGrid/> of real in-app screens with a caption. Light/dark aware via
 * the theming vars — no single-theme hardcoded hex.
 */

type Feature = {
  icon: LucideIcon;
  label: string;
  desc: string;
};

type Cluster = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  features: Feature[];
  /** Give the anchor cluster a wider footprint in the bento. */
  wide?: boolean;
};

const CLUSTERS: Cluster[] = [
  {
    id: 'ai-coaching',
    eyebrow: 'AI Coaching',
    title: 'Ria, your AI coach',
    blurb:
      'A coach that actually knows your rota, your goals and your macros — and rebuilds your plan on demand.',
    icon: Bot,
    wide: true,
    features: [
      { icon: MessageSquare, label: 'Chat coaching', desc: 'Ask Ria anything, 24/7.' },
      { icon: Mic, label: 'Voice coaching', desc: 'Talk it through hands-free.' },
      { icon: Sparkles, label: 'Personalized meal plans', desc: 'Built around your day.' },
      { icon: Target, label: 'Macro tracking', desc: 'Protein, carbs & fat, dialed in.' },
      { icon: Bot, label: 'Plan generation', desc: 'Fresh plans on tap.' },
    ],
  },
  {
    id: 'chrono',
    eyebrow: 'Chrono-nutrition',
    title: 'Timed to your shift',
    blurb:
      'Meals, caffeine, training and sleep aligned to your real rota and circadian science.',
    icon: Clock,
    features: [
      { icon: Clock, label: 'Meal timing', desc: 'Fuel at the right hour.' },
      { icon: Coffee, label: 'Caffeine cut-offs', desc: 'Protect the sleep that matters.' },
      { icon: Dumbbell, label: 'Training windows', desc: 'Train when your body can.' },
      { icon: Moon, label: 'Sleep alignment', desc: 'Wind-down set to clock-off.' },
    ],
  },
  {
    id: 'nutrition',
    eyebrow: 'Nutrition',
    title: 'Log it in a snap',
    blurb: 'Photo logging, a huge food database and 300+ recipes — the whole kitchen.',
    icon: Camera,
    wide: true,
    features: [
      { icon: Camera, label: 'AI photo logging', desc: 'Snap a plate, get the macros.' },
      { icon: Database, label: '8,600+ food database', desc: 'Search anything.' },
      { icon: ScanBarcode, label: 'Barcode scanning', desc: 'Packaged food in one tap.' },
      { icon: BookOpen, label: '300+ recipes', desc: 'Shift-friendly meals.' },
      { icon: ShoppingCart, label: 'Grocery lists', desc: 'Auto-built from your plan.' },
      { icon: Droplets, label: 'Hydration', desc: 'Water tracking that nudges.' },
      { icon: Timer, label: 'Fasting tracking', desc: 'Windows around your shift.' },
    ],
  },
  {
    id: 'training',
    eyebrow: 'Training',
    title: 'Move with a plan',
    blurb:
      'A full exercise library, an interactive body-map and AI-built challenges.',
    icon: Dumbbell,
    features: [
      { icon: PlayCircle, label: 'Exercise library', desc: 'Demo videos for every move.' },
      { icon: PersonStanding, label: 'Muscle body-map', desc: 'Interactive, male & female.' },
      { icon: Flame, label: 'Workout of the day', desc: 'Ready when you are.' },
      { icon: Activity, label: 'Active-workout tracking', desc: 'Live sets & reps.' },
      { icon: Trophy, label: 'AI challenges', desc: '3 / 7 / 15 / 30-day plans.' },
    ],
  },
  {
    id: 'womens-health',
    eyebrow: "Women's health",
    title: 'In sync with your cycle',
    blurb: 'Nutrition and training that adapt to every phase of your cycle.',
    icon: CalendarDays,
    features: [
      { icon: CalendarDays, label: 'Cycle calendar', desc: 'Track every phase.' },
      { icon: HeartPulse, label: 'Phase-adapted nutrition', desc: 'Fuel that flexes.' },
      { icon: Dumbbell, label: 'Phase-adapted training', desc: 'Train with your rhythm.' },
    ],
  },
  {
    id: 'wearables',
    eyebrow: 'Tracking & Wearables',
    title: 'Connect any device',
    blurb:
      'Apple Health, Health Connect and literally any Bluetooth wearable — even unbranded ones.',
    icon: Watch,
    wide: true,
    features: [
      { icon: Watch, label: 'Apple Health', desc: 'Two-way sync.' },
      { icon: Activity, label: 'Health Connect', desc: 'Android, covered.' },
      { icon: Bluetooth, label: 'Any BLE wearable', desc: 'Even the unbranded ones.' },
      { icon: HeartPulse, label: 'HR, HRV, sleep', desc: 'Heart-rate, HRV & steps.' },
      { icon: Ruler, label: 'Body metrics', desc: 'Weight & measurements.' },
      { icon: LineChart, label: 'Analytics', desc: 'Trends that mean something.' },
    ],
  },
  {
    id: 'community',
    eyebrow: 'Community & Coaching',
    title: 'Your Crew & real coaches',
    blurb: 'A social feed, leaderboards and a marketplace of verified human coaches.',
    icon: Users,
    features: [
      { icon: Users, label: '"Crew" social feed', desc: 'Share wins & stay accountable.' },
      { icon: Medal, label: 'Leaderboards', desc: 'Friendly competition.' },
      { icon: BadgeCheck, label: 'Verified coaches', desc: 'A vetted marketplace.' },
      { icon: LayoutDashboard, label: 'Coach dashboard', desc: 'Pros manage clients.' },
      { icon: MessageSquare, label: 'Real-time chat', desc: 'Talk to your coach live.' },
    ],
  },
  {
    id: 'personalization',
    eyebrow: 'Personalization & Accounts',
    title: 'Made yours, secured',
    blurb: 'Nine themes, smart reminders, an encyclopedia — plus fast, secure sign-in.',
    icon: Palette,
    features: [
      { icon: Palette, label: '9 themes', desc: 'Make the app your own.' },
      { icon: Bell, label: 'Smart reminders', desc: 'Nudges that fit your day.' },
      { icon: GraduationCap, label: 'Encyclopedia', desc: 'How-tos & the why.' },
      { icon: Mail, label: 'Email, Google & Apple', desc: 'Sign in your way.' },
      { icon: ShieldCheck, label: 'Email OTP verification', desc: 'Secure by default.' },
    ],
  },
];

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const HeadIcon = cluster.icon;
  return (
    <Reveal.Item
      as="li"
      className={cluster.wide ? 'md:col-span-2' : ''}
    >
      <GlowCard as="article" spotlight className="flex h-full flex-col p-6 md:p-7">
        {/* header */}
        <div className="flex items-center gap-3.5">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-lime)] shadow-[0_10px_28px_-14px_rgba(0,0,0,0.7)]"
            aria-hidden="true"
          >
            <HeadIcon className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-lime-light)]">
              {cluster.eyebrow}
            </p>
            <h3 className="[font-family:var(--font-display)] text-2xl font-bold uppercase leading-none tracking-tight">
              {cluster.title}
            </h3>
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
          {cluster.blurb}
        </p>

        {/* hairline divider */}
        <div
          className="my-5 h-px w-full bg-[var(--color-border)]"
          aria-hidden="true"
        />

        {/* feature lines */}
        <ul
          className={
            'grid flex-1 gap-x-6 gap-y-4 ' +
            (cluster.wide ? 'sm:grid-cols-2' : 'grid-cols-1')
          }
        >
          {cluster.features.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.label} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-lime)]/10 text-[var(--color-lime)] ring-1 ring-inset ring-[var(--color-lime)]/25"
                  aria-hidden="true"
                >
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug text-[var(--color-foreground)]">
                    {f.label}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-muted-foreground)]">
                    {f.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </GlowCard>
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
      subtitle="From AI coaching and chrono-nutrition to wearables, community and your cycle — here's the whole toolkit, grouped so you can see it all."
      decoration={
        <>
          <div
            className="glow"
            style={{ width: 620, height: 620, top: -160, left: -180 }}
            aria-hidden="true"
          />
          <div
            className="glow glow-cyan"
            style={{ width: 520, height: 520, bottom: -140, right: -160 }}
            aria-hidden="true"
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal
        as="ul"
        stagger
        className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:gap-6"
      >
        {CLUSTERS.map((cluster) => (
          <ClusterCard key={cluster.id} cluster={cluster} />
        ))}
      </Reveal>

      {/* the auto-shuffling real-screens grid */}
      <Reveal y={28} className="mt-16 md:mt-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-lime-light)]">
              See it live
            </p>
            <h3 className="mt-3 [font-family:var(--font-display)] text-3xl font-bold uppercase leading-[0.98] md:text-4xl lg:text-5xl">
              {totalFeatures}+ features,{' '}
              <GradientText>one dark-and-lime home</GradientText>
            </h3>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
              Every screen here is the real Zeitra app — the same coaching, logging,
              cycle and analytics surfaces you get on day one. No mockups, no
              stock photography.
            </p>
          </div>

          <div className="order-1 lg:order-2">
            <div className="glass gradient-border rounded-[var(--radius-2xl)] p-3 md:p-4">
              <ShuffleGrid />
            </div>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
