'use client';

import * as React from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Clock, Sparkles, Watch, Camera, ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GradientText } from '@/components/ui/gradient-text';
import { AppBadges } from '@/components/ui/app-badges';
import { DeviceFrame } from '@/components/ui/device-frame';
import { StatCounter } from '@/components/ui/stat-counter';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Hero — the cinematic, shift-worker-led opening. Custom layout (not the
 * SectionShell header) so it can carry a spotlight/gradient hero, ambient lime
 * radial glow, grid texture, an atmosphere image panel, and a floating
 * DeviceFrame product shot. Entrance motion via framer-motion, fully honoring
 * prefers-reduced-motion. Client component.
 */
export function Hero() {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 },
    },
  };

  const rise: Variants = reduce
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 28 },
        show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
      };

  const floatAnim = reduce
    ? undefined
    : { y: [0, -12, 0] as number[] };

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28 lg:pt-40"
    >
      {/* ── Ambient decoration (z-0, behind everything) ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className="grid-bg absolute inset-0" />
        {/* primary lime glow — top-left of the copy */}
        <div
          className="glow absolute -left-[10%] -top-[15%] h-[520px] w-[520px] md:h-[680px] md:w-[680px]"
        />
        {/* cyan spark — bottom-right, behind the device */}
        <div
          className="glow-cyan absolute right-[-8%] top-[20%] h-[440px] w-[440px] md:h-[560px] md:w-[560px]"
        />
      </div>

      <div className="container-x relative z-10">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* ─────────────── Copy column ─────────────── */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col items-start text-left"
          >
            <motion.div variants={rise}>
              <Badge variant="lime">
                <Clock aria-hidden="true" />
                Built for the 1.8B the 9-to-5 apps forget
              </Badge>
            </motion.div>

            <motion.h1
              id="hero-title"
              variants={rise}
              className="mt-6 text-5xl font-bold uppercase leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl xl:text-[5.25rem]"
            >
              Your body runs on shifts.{' '}
              <GradientText>So should your fuel.</GradientText>
            </motion.h1>

            <motion.p
              variants={rise}
              className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-muted-foreground)] md:text-xl"
            >
              Zeitra is the AI coach that times your meals, training, caffeine and
              sleep to when you{' '}
              <span className="font-semibold text-[var(--color-foreground)]">
                actually
              </span>{' '}
              work — built for the 1.8&nbsp;billion shift workers the 9-to-5 apps
              forget.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={rise}
              className="mt-9 flex flex-col gap-5"
            >
              <AppBadges />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Button as="a" href="#waitlist" variant="secondary" size="lg">
                  Join the waitlist
                  <ArrowRight aria-hidden="true" />
                </Button>
                <span className="text-sm text-[var(--color-muted-foreground)]">
                  7-day free trial{' '}
                  <span aria-hidden="true" className="mx-1 opacity-50">
                    ·
                  </span>{' '}
                  iOS &amp; Android
                </span>
              </div>
            </motion.div>

            {/* Inline mini-stat strip */}
            <motion.dl
              variants={rise}
              className="mt-12 grid w-full max-w-lg grid-cols-3 gap-4 border-t border-[var(--color-border)] pt-8"
            >
              {[
                { value: 1.8, decimals: 1, suffix: 'B', label: 'Shift workers' },
                { value: 8600, separator: true, suffix: '+', label: 'Foods' },
                { value: 300, suffix: '+', label: 'Recipes' },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <dd className="text-2xl font-bold text-[var(--color-lime)] md:text-3xl [font-family:var(--font-display)]">
                    <StatCounter
                      value={s.value}
                      decimals={s.decimals}
                      suffix={s.suffix}
                      separator={s.separator}
                    />
                  </dd>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    {s.label}
                  </dt>
                </div>
              ))}
            </motion.dl>
          </motion.div>

          {/* ─────────────── Visual column ─────────────── */}
          <motion.div
            initial={reduce ? undefined : { opacity: 0, scale: 0.96, y: 24 }}
            animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
            className="relative mx-auto w-full max-w-[520px] lg:mx-0"
          >
            {/* Atmosphere panel — hero.webp behind a glass/gradient container so a
                missing file still looks intentional. */}
            <div className="glass gradient-border relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-2xl)]">
              {/* designed gradient placeholder underlay */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(120% 90% at 70% 0%, rgba(168,204,60,0.22), transparent 55%), radial-gradient(90% 70% at 20% 100%, rgba(0,212,170,0.16), transparent 60%), linear-gradient(180deg, #10131c, #0a0c12)',
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/hero.webp"
                alt="Night-shift athlete training in a dark, cinematic gym lit with lime accents"
                loading="eager"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover opacity-90"
              />
              {/* vignette + top sheen for depth over the image */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(10,12,18,0) 40%, rgba(10,12,18,0.85) 100%)',
                }}
              />

              {/* floating "chrono" chips over the atmosphere */}
              <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-5 sm:top-5">
                <FloatChip icon={<Camera aria-hidden="true" className="size-3.5" />}>
                  AI photo logging
                </FloatChip>
                <FloatChip icon={<Watch aria-hidden="true" className="size-3.5" />}>
                  Syncs any wearable
                </FloatChip>
              </div>

              {/* caption anchored bottom-left */}
              <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
                <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
                  <Sparkles
                    aria-hidden="true"
                    className="size-4 text-[var(--color-lime)]"
                  />
                  Meet Ria — your chrono-nutrition coach
                </p>
              </div>
            </div>

            {/* Floating device product shot, overlapping the panel's lower edge */}
            <motion.div
              animate={floatAnim}
              transition={
                reduce
                  ? undefined
                  : { duration: 6, ease: 'easeInOut', repeat: Infinity }
              }
              className="pointer-events-none absolute -bottom-10 -right-2 z-20 hidden sm:block lg:-right-6"
            >
              <DeviceFrame
                width={172}
                caption={
                  <span className="text-[var(--color-lime)]/80">Your timed day</span>
                }
              />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** Small glassy chip floated over the atmosphere image. */
function FloatChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-black/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-foreground)] backdrop-blur-md">
      <span className="text-[var(--color-lime)]">{icon}</span>
      {children}
    </span>
  );
}
