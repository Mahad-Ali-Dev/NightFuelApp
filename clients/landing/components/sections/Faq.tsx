'use client';

import * as React from 'react';
import { Accordion } from 'radix-ui';
import { useReducedMotion } from 'framer-motion';
import { Plus, LifeBuoy } from 'lucide-react';

import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { Reveal } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Faq — radix Accordion with the 6 Q/A from the brief. Two-column layout:
 * a sticky intro/support rail on the left, the accordion on the right. Lime
 * active state + a self-contained open/close height animation (scoped
 * keyframes so it does not depend on globals.css). Respects reduced-motion.
 */

type QA = { q: string; a: React.ReactNode };

const FAQS: QA[] = [
  {
    q: 'Does it really adapt to MY shift pattern?',
    a: (
      <>
        Yes. Tell Zeitra your real rota — nights, rotating, split, or
        four-on-four-off — and Ria times your meals, caffeine, training and
        sleep windows around when you actually work, not a textbook 9-to-5.
      </>
    ),
  },
  {
    q: 'Which wearables work?',
    a: (
      <>
        Effectively any of them. Zeitra pairs with any Bluetooth heart-rate band
        or watch — including unbranded ones — and syncs with{' '}
        <span className="text-[var(--color-foreground)]">Apple Health</span> and{' '}
        <span className="text-[var(--color-foreground)]">Health Connect</span> on
        Android, so your existing gear just works.
      </>
    ),
  },
  {
    q: 'Is it on iOS and Android?',
    a: (
      <>
        Yes — Zeitra ships natively on both the App Store and Google Play, with
        the same full feature set on each.
      </>
    ),
  },
  {
    q: 'Is my health data private?',
    a: (
      <>
        Yes. Your account is protected with secure authentication and your
        health data isn&apos;t sold — it exists to power your coaching, nothing
        else.
      </>
    ),
  },
  {
    q: 'Can I cancel anytime?',
    a: (
      <>
        Anytime, right from your device — no phone calls, no retention maze.
        Start with a 7-day free trial and only keep going if Zeitra earns its
        place.
      </>
    ),
  },
  {
    q: 'Do I need a human coach?',
    a: (
      <>
        No. Ria, your built-in AI coach, handles plans, macros and adjustments
        on her own. If you want a human, the marketplace of verified coaches is
        there — entirely optional.
      </>
    ),
  },
];

export function Faq() {
  const reduce = useReducedMotion();

  return (
    <SectionShell
      id="faq"
      align="left"
      eyebrow="FAQ"
      title={
        <>
          Questions, <GradientText>answered straight</GradientText>
        </>
      }
      subtitle="Everything you need to know before Zeitra starts running on your clock."
      decoration={
        <>
          <div
            className="glow"
            aria-hidden="true"
            style={{ width: 520, height: 520, top: '8%', right: '-10%' }}
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      {/* Scoped accordion open/close animation — self-contained, no globals dep. */}
      <style>{`
        @keyframes zt-faq-down {
          from { height: 0; opacity: 0; }
          to { height: var(--radix-accordion-content-height); opacity: 1; }
        }
        @keyframes zt-faq-up {
          from { height: var(--radix-accordion-content-height); opacity: 1; }
          to { height: 0; opacity: 0; }
        }
        .zt-faq-content[data-state='open'] { animation: zt-faq-down 0.32s cubic-bezier(0.16,1,0.3,1); }
        .zt-faq-content[data-state='closed'] { animation: zt-faq-up 0.28s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) {
          .zt-faq-content[data-state='open'],
          .zt-faq-content[data-state='closed'] { animation: none; }
        }
      `}</style>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] lg:gap-16">
        {/* Left intro / support rail */}
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-lg leading-relaxed text-[var(--color-muted-foreground)]">
            Built for the{' '}
            <span className="font-semibold text-[var(--color-foreground)]">
              1.8 billion shift workers
            </span>{' '}
            the 9-to-5 apps forget — plus everyone who wants training and
            nutrition that bends to real life.
          </p>

          <div className="mt-8 glass gradient-border rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--color-lime)]/12 text-[var(--color-lime)] ring-1 ring-[var(--color-lime)]/25">
                <LifeBuoy className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-[var(--color-foreground)]">
                  Still have a question?
                </p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  We usually reply within a day.
                </p>
              </div>
            </div>
            <Button
              as="a"
              href="#waitlist"
              variant="secondary"
              size="md"
              className="mt-5 w-full"
            >
              Join the waitlist
            </Button>
          </div>
        </Reveal>

        {/* Accordion */}
        <Reveal delay={0.06}>
          <Accordion.Root
            type="single"
            collapsible
            defaultValue="item-0"
            className="flex flex-col gap-3"
          >
            {FAQS.map((item, i) => (
              <Accordion.Item
                key={i}
                value={`item-${i}`}
                className={cn(
                  'glass gradient-border overflow-hidden rounded-2xl',
                  'transition-shadow duration-300',
                  'data-[state=open]:shadow-[0_0_50px_-24px_rgba(168,204,60,0.55)]',
                )}
              >
                <Accordion.Header className="m-0">
                  <Accordion.Trigger
                    className={cn(
                      'group flex w-full items-center justify-between gap-4 px-5 py-5 md:px-6',
                      'cursor-pointer select-none text-left',
                      'text-lg font-semibold leading-snug tracking-tight md:text-xl',
                      'text-[var(--color-foreground)]',
                      'transition-colors duration-200',
                      'hover:text-[var(--color-lime-light)]',
                      'data-[state=open]:text-[var(--color-lime)]',
                      'rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lime)]',
                    )}
                  >
                    <span>{item.q}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full',
                        'border border-[var(--color-border-strong)] bg-white/[0.03]',
                        'text-[var(--color-muted-foreground)]',
                        'transition-colors duration-200',
                        'group-hover:border-[var(--color-lime)]/50 group-hover:text-[var(--color-lime)]',
                        'group-data-[state=open]:border-[var(--color-lime)]/60 group-data-[state=open]:bg-[var(--color-lime)]/12 group-data-[state=open]:text-[var(--color-lime)]',
                      )}
                    >
                      <span className="grid place-items-center transition-transform duration-300 group-data-[state=open]:rotate-45 motion-reduce:transition-none">
                        <Plus className="size-4" />
                      </span>
                    </span>
                  </Accordion.Trigger>
                </Accordion.Header>

                <Accordion.Content
                  className={cn(
                    'zt-faq-content overflow-hidden',
                    !reduce && 'will-change-[height]',
                  )}
                >
                  <div className="px-5 pb-6 pt-0 md:px-6">
                    <div className="mb-4 h-px w-full bg-[var(--color-border)]" />
                    <p className="max-w-prose text-[15px] leading-relaxed text-[var(--color-muted-foreground)] md:text-base">
                      {item.a}
                    </p>
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Reveal>
      </div>
    </SectionShell>
  );
}

export default Faq;
