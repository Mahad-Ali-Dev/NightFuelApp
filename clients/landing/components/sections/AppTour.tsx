'use client';

import { ZoomParallax } from '@/components/ui/zoom-parallax';
import { GradientText } from '@/components/ui/gradient-text';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/ui/reveal';

/**
 * AppTour — a scroll-zoom tour of the real Zeitra app. The <ZoomParallax>
 * canvas is 300vh tall by design: as you scroll the seven real app screens
 * zoom out from a single hero and fan into a composed grid. Uses the actual
 * dark-UI screenshots from /images/screens.
 *
 * Client-only because ZoomParallax relies on framer-motion scroll + transforms.
 */
const TOUR_SCREENS: { src: string; alt: string }[] = [
  { src: '/images/screens/home.png', alt: 'Zeitra home dashboard tuned to your shift' },
  { src: '/images/screens/meals.png', alt: 'Meal tracking and daily macro targets' },
  { src: '/images/screens/log-meal.png', alt: 'AI photo meal-logging screen' },
  { src: '/images/screens/cycle-calendar.png', alt: 'Cycle calendar with phase-adapted nutrition' },
  { src: '/images/screens/coach-dashboard.png', alt: 'Verified coach dashboard' },
  { src: '/images/screens/analytics.png', alt: 'Analytics for HRV, sleep and body metrics' },
  { src: '/images/screens/community.png', alt: 'Crew community feed and leaderboards' },
];

export function AppTour() {
  return (
    <section
      id="app-tour"
      aria-labelledby="app-tour-title"
      className="relative"
    >
      {/* Section header — SectionShell-style, sits above the 300vh zoom canvas */}
      <div className="section relative overflow-hidden">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
          style={{ background: 'var(--glow-lime)' }}
        />
        <div className="container-x">
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <Badge variant="lime">The whole app</Badge>
            <h2
              id="app-tour-title"
              className="text-4xl font-bold uppercase leading-[0.98] md:text-5xl lg:text-6xl"
            >
              See the whole app{' '}
              <GradientText>come into focus</GradientText>
            </h2>
            <p className="text-lg leading-relaxed text-[var(--color-muted-foreground)] md:text-xl">
              Keep scrolling. Every real screen — from your shift-tuned home to
              cycle syncing, coaching and your Crew — zooms into place.
            </p>
          </Reveal>
        </div>
      </div>

      {/* The 300vh scroll-zoom tour of the real app screens */}
      <div className="relative">
        {/* soft top fade so the zoom canvas blends out of the header */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[var(--color-background)] to-transparent"
        />
        <ZoomParallax images={TOUR_SCREENS} />
        {/* soft bottom fade back into page background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[var(--color-background)] to-transparent"
        />
      </div>
    </section>
  );
}
