'use client';

import * as React from 'react';
import {
  Clock,
  Camera,
  ChefHat,
  Sparkles,
  Users,
  LineChart,
  Dumbbell,
  type LucideIcon,
} from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GradientText } from '@/components/ui/gradient-text';
import { PhoneShell } from '@/components/ui/phone-shell';

/**
 * FeatureShowcase — the app tour, done properly. Six alternating rows: a REAL
 * on-device screen inside a clean phone shell on one side, tight feature copy
 * on the other. Replaces the zoom-parallax collage (raw tall screenshots
 * cropped into a pile read as broken). id stays "app-tour" so the Nav "Tour"
 * anchor keeps working.
 */

type Row = {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: React.ReactNode;
  desc: string;
  points: string[];
  screen: string;
  alt: string;
  /** Optional screen-recording loop (real in-app footage); screen = poster. */
  video?: string;
};

const ROWS: Row[] = [
  {
    id: 'rhythm',
    icon: Clock,
    eyebrow: 'Chrono-nutrition',
    title: <>Your rhythm, <GradientText>tonight</GradientText></>,
    desc: 'Zeitra reads your shift and lays the night out for you — when to fuel, when to cut caffeine, when to wind down.',
    points: [
      'Live timeline from clock-in to lights-out',
      'Caffeine cut-off that protects your sleep',
      'Wind-down cues set to your clock-off',
    ],
    screen: '/images/app/rhythm.webp',
    alt: 'Zeitra — the “your rhythm tonight” timeline with caffeine cut-off and wind-down',
    video: '/videos/sleep.mp4',
  },
  {
    id: 'log',
    icon: Camera,
    eyebrow: 'Effortless logging',
    title: <>Log a meal in <GradientText>seconds</GradientText></>,
    desc: 'Snap a plate and the AI estimates it. Scan a barcode. Or build your plate from 8,600+ foods with live macro totals.',
    points: [
      'AI plate scanning with instant estimates',
      'Barcode scanning for packaged food',
      'Running calorie + macro totals as you build',
    ],
    screen: '/images/app/plate-macros.webp',
    alt: 'Zeitra — building a plate with live calorie and macro totals',
    video: '/videos/macros.mp4',
  },
  {
    id: 'kitchen',
    icon: ChefHat,
    eyebrow: 'Ria’s Kitchen',
    title: <>300+ recipes, <GradientText>macro-counted</GradientText></>,
    desc: 'Chef-crafted meals with full macros, filtered to your goal and diet — quick enough for a break-room, good enough to crave.',
    points: [
      'Every recipe with kcal, protein, carbs & fat',
      'Quick & easy, high-protein, vegan, keto filters',
      'Add any recipe to today in one tap',
    ],
    screen: '/images/app/recipes.webp',
    alt: 'Zeitra — Ria’s Kitchen recipe grid with calories and macros',
    video: '/videos/kitchen.mp4',
  },
  {
    id: 'planner',
    icon: Sparkles,
    eyebrow: 'AI training',
    title: <>A plan built <GradientText>around you</GradientText></>,
    desc: 'Pick a goal, your days and your equipment — the AI planner assembles the split, the exercises and the progression.',
    points: [
      'Strength, muscle or endurance goals',
      'Fits your days per week and equipment',
      'Full exercise library with demo videos',
    ],
    screen: '/images/app/ai-planner.webp',
    alt: 'Zeitra — the AI workout planner choosing goal and level',
  },
  {
    id: 'bodymap',
    icon: Dumbbell,
    eyebrow: 'Built for your body',
    title: <>Training that <GradientText>knows you</GradientText></>,
    desc: 'Tell Zeitra who you are and where you train — every exercise list, muscle map and workout adapts, male or female, gym or home.',
    points: [
      'Male & female exercise catalogues',
      'Target any muscle group — 480+ exercises',
      'Gym, home, cardio & recovery categories',
    ],
    screen: '/images/app/muscle-groups.webp',
    alt: 'Zeitra — choosing who you train as, then targeting muscle groups',
    video: '/videos/bodymap.mp4',
  },
  {
    id: 'crew',
    icon: Users,
    eyebrow: 'Community',
    title: <>Your Crew keeps you <GradientText>honest</GradientText></>,
    desc: 'Leaderboards, challenges and a feed of people who get your schedule — plus verified human coaches when you want one.',
    points: [
      'Leaderboards & seasonal challenges',
      'Share wins with the Crew feed',
      'Real-time chat with verified coaches',
    ],
    screen: '/images/app/crew.webp',
    alt: 'Zeitra — the Crew screen with leaderboard, challenges and achievements',
    video: '/videos/crew.mp4',
  },
  {
    id: 'themes',
    icon: Sparkles,
    eyebrow: 'Personalization',
    title: <>Make it <GradientText>yours</GradientText></>,
    desc: 'Nine hand-tuned themes — switch the whole app’s mood in one tap, from midnight lime to ember and mono.',
    points: [
      '9 themes, one tap to switch',
      'Smart reminders that fit your day',
      'Night-shift friendly dark modes',
    ],
    screen: '/images/app/themes.webp',
    alt: 'Zeitra — the theme picker switching the app’s look',
    video: '/videos/themes.mp4',
  },
  {
    id: 'insights',
    icon: LineChart,
    eyebrow: 'Insights',
    title: <>See what your body is <GradientText>telling you</GradientText></>,
    desc: 'Sleep vs performance, correlated. Zeitra builds your circadian baseline and shows how the nights you keep shape the numbers you hit.',
    points: [
      'Sleep × performance correlation',
      'Circadian entrainment baseline',
      'Wearable data folded in automatically',
    ],
    screen: '/images/app/insights.webp',
    alt: 'Zeitra — sleep versus performance insights',
  },
];

function ShowcaseRow({ row, flip }: { row: Row; flip: boolean }) {
  const Icon = row.icon;
  return (
    <Reveal y={26}>
      <div
        className={
          'grid items-center gap-10 md:gap-14 lg:gap-20 md:grid-cols-2 ' +
          (flip ? '' : '')
        }
      >
        {/* copy */}
        <div className={flip ? 'md:order-2' : ''}>
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-lime)]/12 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-lime-dark)]">
            <Icon className="size-3.5" />
            {row.eyebrow}
          </span>
          <h3 className="mt-4 [font-family:var(--font-display)] text-3xl font-bold leading-[1.08] tracking-[-0.02em] md:text-4xl">
            {row.title}
          </h3>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
            {row.desc}
          </p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {row.points.map((p) => (
              <li key={p} className="flex items-baseline gap-2.5 text-[14px] leading-snug">
                <span
                  className="size-[5px] shrink-0 translate-y-[-2px] rounded-full bg-[var(--color-lime)]"
                  aria-hidden="true"
                />
                <span className="text-[var(--color-foreground)]">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* real screen in a shell */}
        <div className={'flex justify-center ' + (flip ? 'md:order-1' : '')}>
          <PhoneShell
            src={row.screen}
            alt={row.alt}
            os={flip ? 'ios' : 'android'}
            glow
            video={row.video}
            className="w-full max-w-[260px] md:max-w-[290px]"
          />
        </div>
      </div>
    </Reveal>
  );
}

export function FeatureShowcase() {
  return (
    <SectionShell
      id="app-tour"
      eyebrow="Inside the app"
      title={
        <>
          Real screens, <GradientText>real routine</GradientText>
        </>
      }
      subtitle="Straight off the device — this is what running your day on Zeitra actually looks like."
    >
      <div className="flex flex-col gap-20 md:gap-28">
        {ROWS.map((row, i) => (
          <ShowcaseRow key={row.id} row={row} flip={i % 2 === 1} />
        ))}
      </div>
    </SectionShell>
  );
}
