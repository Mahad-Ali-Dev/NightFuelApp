'use client';

import { ZoomParallax } from '@/components/ui/zoom-parallax';
import { GradientText } from '@/components/ui/gradient-text';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/ui/reveal';

/**
 * AppTour — a scroll-zoom tour of the REAL app. The <ZoomParallax> canvas is
 * 300vh tall by design: as you scroll, seven real Zeitra screens (captured on
 * device, /images/app) zoom out from the home dashboard and fan into a
 * composed grid.
 *
 * Client-only because ZoomParallax relies on framer-motion scroll + transforms.
 */
const TOUR_SCREENS: { src: string; alt: string }[] = [
  { src: '/images/app/home.webp', alt: 'The Zeitra home dashboard with tonight’s training and pre-shift meal' },
  { src: '/images/app/scan-plate.webp', alt: 'AI plate scanning — point the camera at a meal to log it' },
  { src: '/images/app/recipes.webp', alt: 'Ria’s Kitchen — chef-crafted recipes with full macros' },
  { src: '/images/app/rhythm.webp', alt: 'Your rhythm tonight — caffeine cut-off and wind-down timeline' },
  { src: '/images/app/crew.webp', alt: 'Crew — leaderboards, challenges and your standing' },
  { src: '/images/app/ai-planner.webp', alt: 'AI workout planner building a plan around your goal' },
  { src: '/images/app/insights.webp', alt: 'Sleep vs performance insights and circadian entrainment' },
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
            <Badge variant="lime">Real life, real fuel</Badge>
            <h2
              id="app-tour-title"
              className="text-4xl font-bold uppercase leading-[0.98] md:text-5xl lg:text-6xl"
            >
              Built for the way{' '}
              <GradientText>you actually live</GradientText>
            </h2>
            <p className="text-lg leading-relaxed text-[var(--color-muted-foreground)] md:text-xl">
              Keep scrolling — these are real screens from the app. Plate
              scanning, chef-crafted recipes, your nightly rhythm, the Crew and
              the AI planner, all in one place.
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
