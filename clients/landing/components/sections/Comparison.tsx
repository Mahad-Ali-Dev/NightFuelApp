import * as React from 'react';
import { Check, Minus, Zap } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { GlowCard } from '@/components/ui/glow-card';
import { Reveal } from '@/components/ui/reveal';
import { GradientText } from '@/components/ui/gradient-text';
import { Badge } from '@/components/ui/badge';

/**
 * Comparison — Zeitra vs generic apps across the capabilities that matter to
 * shift workers and cycle-aware training. Lime checks for Zeitra, muted
 * dashes for the 9-to-5 crowd. Renders a proper <table> on md+ (sticky first
 * column, highlighted Zeitra column) and stacks into per-row cards on mobile.
 * Server-safe (motion lives inside the Reveal/GlowCard boundaries).
 */

interface Row {
  feature: string;
  detail: string;
  zeitra: boolean;
  /** false = missing, 'limited' = partial */
  generic: false | 'limited';
}

const ROWS: Row[] = [
  {
    feature: 'Schedule / shift-aware timing',
    detail: 'Meals, caffeine & sleep aligned to your real rota',
    zeitra: true,
    generic: false,
  },
  {
    feature: 'Menstrual-cycle adaptation',
    detail: 'Nutrition & training tuned to cycle phases',
    zeitra: true,
    generic: false,
  },
  {
    feature: 'AI coach (chat + voice)',
    detail: 'Ria builds plans and answers on demand',
    zeitra: true,
    generic: 'limited',
  },
  {
    feature: 'AI photo meal-logging',
    detail: 'Snap a plate — 8,600+ food DB + barcode',
    zeitra: true,
    generic: 'limited',
  },
  {
    feature: 'Any-wearable Bluetooth sync',
    detail: 'Even unbranded bands + Apple Health & Health Connect',
    zeitra: true,
    generic: false,
  },
  {
    feature: 'Human-coaching marketplace',
    detail: 'Verified coaches, in-app — optional',
    zeitra: true,
    generic: false,
  },
  {
    feature: 'Community & challenges',
    detail: 'Crew feed, accountability, AI-picked challenges',
    zeitra: true,
    generic: 'limited',
  },
];

function ZeitraMark() {
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--color-lime)]/35 bg-[var(--color-lime)]/[0.12] text-[var(--color-lime)] shadow-[0_0_22px_-8px_rgba(168,204,60,0.7)]">
      <Check className="size-[1.1rem]" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}

function GenericMark({ variant }: { variant: false | 'limited' }) {
  if (variant === 'limited') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        <span className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted-foreground)]">
          <Minus className="size-4" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <span className="hidden sm:inline">Limited</span>
      </span>
    );
  }
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/[0.02] text-[var(--color-muted-foreground)]/60">
      <Minus className="size-4" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

/** Accessible cell label for screen readers. */
function statusLabel(value: boolean | 'limited'): string {
  if (value === true) return 'Yes';
  if (value === 'limited') return 'Limited';
  return 'No';
}

export function Comparison() {
  return (
    <SectionShell
      id="comparison"
      eyebrow="The gap"
      title={
        <>
          Built for you. <GradientText>Not the 9-to-5.</GradientText>
        </>
      }
      subtitle="Mainstream apps assume a Monday-to-Friday clock. Here's what changes when the app actually runs on your schedule."
      decoration={
        <>
          <div
            className="glow"
            style={{ width: 560, height: 560, top: '10%', right: '-8%' }}
            aria-hidden="true"
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal>
        {/* ── Desktop / tablet: real table ───────────────────────────── */}
        <div className="hidden md:block">
          <GlowCard className="overflow-hidden p-0" hover={false}>
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Feature comparison of Zeitra versus generic fitness apps
              </caption>
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-[var(--color-panel-2)] px-6 py-5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]"
                  >
                    Capability
                  </th>
                  <th scope="col" className="px-6 py-4 text-center align-bottom">
                    {/* Highlighted Zeitra column header */}
                    <div className="mx-auto flex max-w-[10rem] flex-col items-center gap-2 rounded-xl border border-[var(--color-lime)]/40 bg-[var(--color-lime)]/[0.06] px-4 py-3 shadow-[0_0_40px_-18px_rgba(168,204,60,0.7)]">
                      <span className="inline-flex items-center gap-1.5 text-lg font-bold uppercase tracking-tight text-[var(--color-foreground)] [font-family:var(--font-display)]">
                        <Zap
                          className="size-4 text-[var(--color-lime)]"
                          aria-hidden="true"
                        />
                        Zeitra
                      </span>
                      <Badge variant="lime" className="text-[0.6rem]">
                        Timing-first
                      </Badge>
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-center align-bottom text-lg font-bold uppercase tracking-tight text-[var(--color-muted-foreground)] [font-family:var(--font-display)]"
                  >
                    Generic apps
                    <span className="mt-1 block text-[0.65rem] font-medium normal-case tracking-normal text-[var(--color-muted-foreground)]/70">
                      MyFitnessPal, Noom, etc.
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr
                    key={row.feature}
                    className="group border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-[var(--color-panel-2)] px-6 py-5 align-middle font-normal transition-colors group-hover:bg-[var(--color-card)]"
                    >
                      <span className="block text-base font-semibold text-[var(--color-foreground)]">
                        {row.feature}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                        {row.detail}
                      </span>
                    </th>
                    <td className="bg-[var(--color-lime)]/[0.035] px-6 py-5 text-center align-middle">
                      <span className="sr-only">{statusLabel(row.zeitra)}</span>
                      <span className="inline-flex justify-center" aria-hidden="true">
                        <ZeitraMark />
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center align-middle">
                      <span className="sr-only">{statusLabel(row.generic)}</span>
                      <span className="inline-flex justify-center" aria-hidden="true">
                        <GenericMark variant={row.generic} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlowCard>
        </div>

        {/* ── Mobile: stacked per-row cards ──────────────────────────── */}
        <ul className="flex flex-col gap-4 md:hidden">
          {ROWS.map((row) => (
            <li key={row.feature}>
              <GlowCard className="p-5" hover={false}>
                <p className="text-base font-semibold text-[var(--color-foreground)]">
                  {row.feature}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                  {row.detail}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-lime)]/30 bg-[var(--color-lime)]/[0.06] px-3 py-3">
                    <span className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-lime-light)]">
                      Zeitra
                    </span>
                    <span className="sr-only">{statusLabel(row.zeitra)}</span>
                    <span aria-hidden="true">
                      <ZeitraMark />
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white/[0.02] px-3 py-3">
                    <span className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                      Generic
                    </span>
                    <span className="sr-only">{statusLabel(row.generic)}</span>
                    <span aria-hidden="true">
                      <GenericMark variant={row.generic} />
                    </span>
                  </div>
                </div>
              </GlowCard>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={0.1}>
        <p className="mt-8 text-center text-sm text-[var(--color-muted-foreground)]">
          One app, every feature included —{' '}
          <span className="font-semibold text-[var(--color-foreground)]">
            no more juggling 4-5 disconnected tools.
          </span>
        </p>
      </Reveal>
    </SectionShell>
  );
}
