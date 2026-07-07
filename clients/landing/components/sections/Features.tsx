'use client';

import * as React from 'react';
import {
  Bot,
  Timer,
  Camera,
  UtensilsCrossed,
  Dumbbell,
  Trophy,
  Watch,
  Users,
  BadgeCheck,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';

import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { Reveal } from '@/components/ui/reveal';
import { GlowCard } from '@/components/ui/glow-card';
import { Badge } from '@/components/ui/badge';

/**
 * Features — the product showcase. A premium BENTO grid of Zeitra's core
 * features. Flagship tiles (Ria, chrono-nutrition, wearable sync) get a larger,
 * richer treatment; the rest fill a varied, magazine-style grid. Every tile is
 * a GlowCard (glass + gradient-border ring) with a lucide icon, title and a
 * single supporting line, plus a hover lift and pointer spotlight.
 */

type Feature = {
  icon: LucideIcon;
  title: string;
  copy: string;
  /** Tailwind grid-span classes for the lg bento layout. */
  span: string;
  /** Flagship tiles get a larger, display-type treatment. */
  flagship?: boolean;
  /** Optional accent chip. */
  tag?: string;
};

const FEATURES: Feature[] = [
  {
    icon: Bot,
    title: 'Meet Ria, your AI coach',
    copy: 'Chat or talk to Ria. She builds your meal plans, tracks every macro and adapts as your week shifts.',
    span: 'lg:col-span-3 lg:row-span-2',
    flagship: true,
    tag: 'Chat + voice',
  },
  {
    icon: Timer,
    title: 'Chrono-nutrition engine',
    copy: 'Meals, caffeine, training and sleep timed to your real rota — not a textbook 9-to-5 clock.',
    span: 'lg:col-span-3 lg:row-span-2',
    flagship: true,
    tag: 'The core',
  },
  {
    icon: Camera,
    title: 'AI photo meal-logging',
    copy: 'Snap a plate and log it. Backed by 8,600+ foods and barcode scan.',
    span: 'lg:col-span-2',
  },
  {
    icon: UtensilsCrossed,
    title: '300+ recipes',
    copy: 'Shift-friendly meals that fit your macros and your window.',
    span: 'lg:col-span-2',
  },
  {
    icon: Dumbbell,
    title: 'Workouts + body-map',
    copy: 'Exercise library, interactive muscle body-map and ready-made WODs.',
    span: 'lg:col-span-2',
  },
  {
    icon: Watch,
    title: 'Sync any wearable',
    copy: 'Any watch or band — even unbranded ones — over Bluetooth, plus Apple Health & Health Connect.',
    span: 'lg:col-span-3',
    flagship: true,
    tag: 'Any device',
  },
  {
    icon: Trophy,
    title: 'AI challenges',
    copy: '3, 7, 15 or 30-day challenges with AI-picked workouts and meals.',
    span: 'lg:col-span-3',
  },
  {
    icon: Users,
    title: 'Community "Crew"',
    copy: 'A feed and accountability circle for people the 9-to-5 apps forget.',
    span: 'lg:col-span-2',
  },
  {
    icon: BadgeCheck,
    title: 'Coaching marketplace',
    copy: 'Book verified human coaches when you want a real person in your corner.',
    span: 'lg:col-span-2',
  },
  {
    icon: MessagesSquare,
    title: 'Chat + smart reminders',
    copy: 'Real-time messaging and nudges timed to when you actually work.',
    span: 'lg:col-span-2',
  },
];

function FeatureTile({ icon: Icon, title, copy, span, flagship, tag }: Feature) {
  return (
    <Reveal.Item as="li" className={`flex ${span}`}>
      <GlowCard
        as="article"
        spotlight
        className={`flex w-full flex-col ${flagship ? 'p-7 md:p-8' : 'p-6'}`}
      >
        {/* icon + optional tag */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-lime)]/25 bg-[var(--color-lime)]/10 text-[var(--color-lime)] ${
              flagship ? 'size-12 [&_svg]:size-6' : 'size-11 [&_svg]:size-5'
            }`}
          >
            <Icon strokeWidth={1.75} />
          </span>
          {tag && (
            <Badge variant="outline" className="shrink-0">
              {tag}
            </Badge>
          )}
        </div>

        <h3
          className={`font-semibold leading-tight ${
            flagship
              ? 'text-2xl uppercase tracking-tight [font-family:var(--font-display)] md:text-3xl'
              : 'text-lg md:text-xl'
          }`}
        >
          {title}
        </h3>

        <p
          className={`mt-2 leading-relaxed text-[var(--color-muted-foreground)] ${
            flagship ? 'max-w-md text-base md:text-lg' : 'text-sm md:text-[15px]'
          }`}
        >
          {copy}
        </p>

        {flagship && (
          <div aria-hidden="true" className="mt-auto pt-6">
            <div className="h-px w-full bg-gradient-to-r from-[var(--color-lime)]/40 via-white/10 to-transparent" />
          </div>
        )}
      </GlowCard>
    </Reveal.Item>
  );
}

export function Features() {
  return (
    <SectionShell
      id="features"
      eyebrow="The product"
      title={
        <>
          Everything you need, <GradientText>timed to you</GradientText>
        </>
      }
      subtitle="One app that replaces the four or five you juggle now — coaching, nutrition, training, wearables and community, all aligned to your real schedule."
      decoration={
        <>
          <div
            className="glow"
            style={{ width: 620, height: 620, top: '-6%', left: '-10%' }}
          />
          <div
            className="glow-cyan"
            style={{ width: 520, height: 520, bottom: '-8%', right: '-8%' }}
          />
          <div className="dot-bg" />
        </>
      }
    >
      <Reveal
        as="ul"
        stagger
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-6 lg:auto-rows-fr"
      >
        {FEATURES.map((feature) => (
          <FeatureTile key={feature.title} {...feature} />
        ))}
      </Reveal>
    </SectionShell>
  );
}

export default Features;
