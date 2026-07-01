'use client';

import * as React from 'react';
import {
  Camera,
  Watch,
  Clock,
  Users,
  ShieldCheck,
  ScanBarcode,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { Marquee } from '@/components/ui/marquee';
import { StatCounter } from '@/components/ui/stat-counter';
import { GradientText } from '@/components/ui/gradient-text';

/**
 * Stats — a compact trust band. Three animated headline numbers
 * (1.8B shift workers, 8,600+ foods, 300+ recipes) sitting on a glass strip,
 * followed by a seamless marquee of value props. Server-safe: all motion is
 * carried by the client primitives (Reveal / Marquee / StatCounter).
 */

interface Stat {
  value: number;
  decimals?: number;
  separator?: boolean;
  suffix?: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 1.8, decimals: 1, suffix: 'B', label: 'Shift workers worldwide' },
  { value: 8600, separator: true, suffix: '+', label: 'Foods in the database' },
  { value: 300, suffix: '+', label: 'Chef-built recipes' },
];

const VALUE_PROPS: { icon: LucideIcon; text: string }[] = [
  { icon: Camera, text: 'AI photo logging' },
  { icon: Watch, text: 'Syncs any wearable' },
  { icon: Clock, text: 'Chrono-nutrition timing' },
  { icon: ScanBarcode, text: 'Barcode scanning' },
  { icon: Users, text: 'Community & challenges' },
  { icon: Sparkles, text: 'Verified coaching marketplace' },
  { icon: ShieldCheck, text: 'Private & secure by design' },
];

export function Stats() {
  return (
    <section
      className="relative py-14 md:py-20"
      aria-label="Zeitra by the numbers"
    >
      <div className="container-x">
        {/* Headline number strip */}
        <Reveal
          as="ul"
          stagger
          className="glass gradient-border grid grid-cols-1 gap-8 rounded-[var(--radius-xl)] px-6 py-10 sm:grid-cols-3 sm:gap-4 sm:px-10 md:py-12"
        >
          {STATS.map((s, i) => (
            <Reveal.Item
              as="li"
              key={s.label}
              className="relative flex flex-col items-center text-center"
            >
              {/* subtle divider between columns on wider screens */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-2 top-1/2 hidden h-14 w-px -translate-y-1/2 bg-[var(--color-border)] sm:block"
                />
              )}
              <StatCounter
                value={s.value}
                decimals={s.decimals}
                separator={s.separator}
                suffix={s.suffix}
                className="text-5xl md:text-6xl font-bold leading-none text-[var(--color-lime)] [font-family:var(--font-display)]"
              />
              <span className="mt-3 text-sm md:text-base font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                {s.label}
              </span>
            </Reveal.Item>
          ))}
        </Reveal>

        {/* Value-prop marquee */}
        <Reveal className="mt-8 md:mt-10" delay={0.1}>
          <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
            Everything in <GradientText>one app</GradientText>
          </p>
          <Marquee speed={38} className="py-2">
            {VALUE_PROPS.map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="mx-1.5 inline-flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)]/70 px-5 py-2.5 text-sm font-medium text-[var(--color-foreground)] backdrop-blur"
              >
                <Icon
                  className="size-4 text-[var(--color-lime)]"
                  aria-hidden="true"
                />
                {text}
              </span>
            ))}
          </Marquee>
        </Reveal>
      </div>
    </section>
  );
}
