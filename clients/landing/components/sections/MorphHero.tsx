'use client';

import ScrollMorphHero from '@/components/ui/scroll-morph-hero';
import { AppBadges } from '@/components/ui/app-badges';
import { GradientText } from '@/components/ui/gradient-text';

/**
 * MorphHero — the landing hero. Twenty REAL Zeitra app screens (from
 * /images/app) scatter in, form a circle around the headline, then morph into
 * a bottom arc as you scroll — the hero doubles as the app gallery.
 *
 * The underlying ScrollMorphHero owns the scroll choreography (virtual scroll
 * 0→3000, released to native page scroll at both bounds).
 */
const HERO_SCREENS = [
  'home',
  'rhythm',
  'train',
  'workout-styles',
  'muscle-groups',
  'scan-plate',
  'barcode',
  'macros',
  'recipes',
  'recipe-detail',
  'crew',
  'chat',
  'leaderboard',
  'ai-planner',
  'insights',
  'circadian',
  'devices',
  'calculator',
  'cycle',
  'sleep-window',
].map((n) => `/images/app/${n}.webp`);

export function MorphHero() {
  return (
    <section id="hero" aria-label="Zeitra — nutrition and training on your clock" className="relative h-[100svh] min-h-[620px]">
      <ScrollMorphHero
        images={HERO_SCREENS}
        introTitle={
          <>
            Your body runs on shifts.
            <br />
            So should <GradientText>your fuel.</GradientText>
          </>
        }
        introSub="Zeitra — AI nutrition & training on your clock · scroll to explore"
        arcTitle={
          <>
            One app. <GradientText>Every feature.</GradientText>
          </>
        }
        arcSub="Meals, training, caffeine and sleep — timed to when you actually work. This is the real app."
        arcExtra={
          <div className="flex flex-col items-center gap-4">
            <AppBadges className="justify-center" />
            <a
              href="#waitlist"
              className="text-sm font-semibold text-[var(--color-lime-dark)] underline-offset-4 hover:underline"
            >
              or join the waitlist →
            </a>
          </div>
        }
      />
      {/* soft fade into the page below */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-[var(--color-background)] to-transparent"
      />
    </section>
  );
}
