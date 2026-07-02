'use client';

import ScrollMorphHero from '@/components/ui/scroll-morph-hero';
import { AppBadges } from '@/components/ui/app-badges';
import { GradientText } from '@/components/ui/gradient-text';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/ui/reveal';

/**
 * MorphHero — the landing hero, stacked layout:
 *
 *   1. A static headline block in normal flow (eyebrow → display headline →
 *      subline → store badges + waitlist link → trust note). Text never
 *      competes with imagery.
 *   2. Below it, the ScrollMorphHero canvas in its own band: twenty REAL app
 *      screens orbit in a circle, then morph into an arc as you scroll
 *      (released to native scroll at both bounds).
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
    <section id="hero" aria-label="Zeitra — nutrition and training on your clock" className="relative overflow-hidden">
      {/* ── 1 · Headline block ─────────────────────────────────────────── */}
      <div className="container-x relative z-10 pt-14 pb-4 text-center md:pt-20">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5">
          {/* SaaS announcement pill */}
          <a
            href="#features"
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] py-1.5 pl-2 pr-3.5 text-[13px] font-medium text-[var(--color-muted-foreground)] shadow-[0_1px_2px_rgba(15,23,20,0.05)] transition-colors hover:border-[var(--color-lime)]/50 hover:text-[var(--color-foreground)]"
          >
            <span className="rounded-full bg-[var(--color-lime)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-lime-dark)]">
              New
            </span>
            Now on iOS &amp; Android — meet Zeitra
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </a>

          <h1 className="[font-family:var(--font-display)] text-[2.9rem] font-bold leading-[1.04] tracking-[-0.025em] md:text-[4.6rem]">
            Your body runs on shifts.
            <br />
            So should <GradientText>your fuel.</GradientText>
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-[var(--color-muted-foreground)] md:text-lg">
            Zeitra is the AI coach that times your meals, training, caffeine and
            sleep to when you <span className="font-semibold text-[var(--color-foreground)]">actually work</span>.
          </p>

          <div className="mt-1 flex flex-col items-center gap-3">
            <AppBadges className="justify-center" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              7-day free trial · iOS &amp; Android ·{' '}
              <a
                href="#waitlist"
                className="font-semibold text-[var(--color-lime-dark)] underline-offset-4 hover:underline"
              >
                join the waitlist
              </a>
            </p>
          </div>
        </Reveal>
      </div>

      {/* ── 2 · The orbit of real app screens (below the text) ────────── */}
      <div className="relative h-[56vh] min-h-[420px] md:h-[64vh]">
        <ScrollMorphHero
          images={HERO_SCREENS}
          introTitle={null}
          introSub={null}
          arcTitle={null}
          arcSub={null}
        />
        {/* small scroll hint in the middle of the orbit */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--color-muted-foreground)]">
            The real app
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-[var(--color-muted-foreground)]/70">
            scroll to explore
          </p>
        </div>
        {/* soft fade into the page below */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-[var(--color-background)] to-transparent"
        />
      </div>
    </section>
  );
}
