'use client';

import * as React from 'react';
import { Moon, Activity, HeartPulse, ArrowUpRight } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientText } from '@/components/ui/gradient-text';

/**
 * Personas — three audience cards (Shift workers / Women-cycle / Everyday
 * fitness). Each is a GlowCard with a subtle lifestyle image behind a glass
 * gradient scrim (so a missing file still reads as intentional), an accent
 * icon, a title and a short line, plus a small tag list.
 */

type Persona = {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  copy: string;
  tags: string[];
  image: string;
  imageAlt: string;
};

const PERSONAS: Persona[] = [
  {
    icon: Moon,
    eyebrow: 'The lead wedge',
    title: 'Shift workers',
    copy: 'Nurses, healthcare, logistics and hospitality — fuel, training and sleep timed to your real rota, not a textbook 9-to-5.',
    tags: ['Nurses', 'Paramedics', 'Logistics', 'Hospitality'],
    image: '/images/lifestyle-nurse.webp',
    imageAlt: 'A healthcare worker on a night shift',
  },
  {
    icon: HeartPulse,
    eyebrow: 'Cycle-aware',
    title: 'Women',
    copy: 'Nutrition and training that adapt across your cycle phases — so your plan works with your body, not against it.',
    tags: ['Cycle phases', 'Energy', 'Recovery', 'Nutrition'],
    image: '/images/food.webp',
    imageAlt: 'A fresh, balanced plate of food',
  },
  {
    icon: Activity,
    eyebrow: 'For real life',
    title: 'Everyday fitness',
    copy: 'One app that adapts to real life — workouts, meals and recovery that flex around whatever your week actually looks like.',
    tags: ['Workouts', 'Meals', 'Recovery', 'Habits'],
    image: '/images/lifestyle-athlete.webp',
    imageAlt: 'An everyday athlete training',
  },
];

export function Personas() {
  return (
    <SectionShell
      id="personas"
      eyebrow="Who it's for"
      title={
        <>
          Built for the people <GradientText>9-to-5 apps forget</GradientText>
        </>
      }
      subtitle="Zeitra starts with shift workers and widens out — same engine, tuned to how you actually live."
      decoration={
        <>
          <div
            className="glow left-1/2 top-0 h-[420px] w-[560px] -translate-x-1/2"
            aria-hidden="true"
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal
        as="ul"
        stagger
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {PERSONAS.map((p) => {
          const Icon = p.icon;
          return (
            <Reveal.Item as="li" key={p.title}>
              <GlowCard
                as="div"
                spotlight
                className="flex h-full flex-col overflow-hidden p-0"
              >
                {/* Image slot — always sits on a glass/gradient bg */}
                <div className="relative h-44 w-full overflow-hidden bg-[linear-gradient(135deg,var(--color-panel-2),var(--color-panel))]">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-10 [background:radial-gradient(120%_90%_at_50%_0%,transparent,rgba(10,12,18,0.35)_60%,rgba(10,12,18,0.9))]"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image}
                    alt={p.imageAlt}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
                  />
                  <span
                    className="absolute left-4 top-4 z-20 inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-lime)]/30 bg-[var(--color-lime)]/10 text-[var(--color-lime-light)] shadow-[0_0_24px_-8px_rgba(168,204,60,0.55)] backdrop-blur"
                    aria-hidden="true"
                  >
                    <Icon className="size-5" />
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-4 p-6 md:p-7">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-lime-light)]">
                      {p.eyebrow}
                    </span>
                    <h3 className="text-2xl font-bold leading-tight tracking-[-0.01em] [font-family:var(--font-display)]">
                      {p.title}
                    </h3>
                  </div>

                  <p className="text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
                    {p.copy}
                  </p>

                  <ul className="mt-auto flex flex-wrap gap-2 pt-2">
                    {p.tags.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-[var(--color-border)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-muted-foreground)]"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </GlowCard>
            </Reveal.Item>
          );
        })}
      </Reveal>

      {/* Bridge line to widen the message */}
      <Reveal delay={0.15}>
        <p className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-center text-sm text-[var(--color-muted-foreground)]">
          <ArrowUpRight className="size-4 text-[var(--color-lime)]" aria-hidden="true" />
          Whatever your clock looks like, Zeitra bends the plan to fit it.
        </p>
      </Reveal>
    </SectionShell>
  );
}
