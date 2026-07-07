'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Sparkles, Send, Mic, Moon, Clock, Flame, Droplets } from 'lucide-react';
import { SectionShell } from '@/components/ui/section-shell';
import { Reveal } from '@/components/ui/reveal';
import { GradientText } from '@/components/ui/gradient-text';
import { Badge } from '@/components/ui/badge';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { MagneticText } from '@/components/ui/magnetic-text';

/**
 * RiaDemo — an interactive-feeling mockup of the AI coach "Ria" as a chat.
 * A glass phone/chat card plays a realistic night-shift-nurse conversation:
 * the user asks about eating at 3am, Ria answers with chrono-nutrition advice
 * and suggests a meal card. Messages fade in on a timeline with a typing
 * indicator; the lime send button is decorative (non-functional).
 *
 * Behind the section sits <BackgroundBeams /> in a relative container; the
 * headline uses <MagneticText> as an accent. Fully light/dark aware — every
 * surface uses the --color-* theme tokens.
 */

type Bubble =
  | { id: number; from: 'user' | 'ria'; kind: 'text'; text: React.ReactNode; at: string }
  | { id: number; from: 'ria'; kind: 'meal'; at: string };

// Scripted conversation. Timings are cumulative reveal beats (ms).
const SCRIPT: { bubble: Bubble; typingBefore?: number; delay: number }[] = [
  {
    delay: 400,
    bubble: {
      id: 1,
      from: 'user',
      kind: 'text',
      at: '3:04 AM',
      text: 'It’s 3am on shift and I’m starving. Should I even eat right now?',
    },
  },
  {
    delay: 900,
    typingBefore: 1400,
    bubble: {
      id: 2,
      from: 'ria',
      kind: 'text',
      at: '3:04 AM',
      text: (
        <>
          You should — just eat for a body that thinks it&apos;s the middle of
          the night. Your gut is in its slow phase, so we go{' '}
          <strong className="font-semibold text-[var(--color-foreground)]">
            lighter, protein-forward, low-GI
          </strong>{' '}
          to keep you sharp without a 5am crash.
        </>
      ),
    },
  },
  {
    delay: 700,
    typingBefore: 1100,
    bubble: {
      id: 3,
      from: 'ria',
      kind: 'text',
      at: '3:05 AM',
      text: (
        <>
          Skip fast carbs and cut caffeine now — you clock off at 7, and
          anything after 3am steals the sleep you need most. Here&apos;s a 4-min
          option from your kit:
        </>
      ),
    },
  },
  {
    delay: 650,
    typingBefore: 900,
    bubble: { id: 4, from: 'ria', kind: 'meal', at: '3:05 AM' },
  },
];

const MEAL = {
  name: 'Greek yogurt + berries + almonds',
  tag: 'Night-shift snack',
  kcal: 280,
  protein: 24,
  carbs: 18,
  fat: 11,
};

function Typing() {
  return (
    <div className="flex items-end gap-2" aria-label="Ria is typing">
      <RiaAvatar small />
      <div className="rounded-2xl rounded-bl-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block size-2 rounded-full bg-[var(--color-muted-foreground)]"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.18,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RiaAvatar({ small = false }: { small?: boolean }) {
  return (
    <span
      className={
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-[var(--color-lime)]/50 shadow-[0_0_18px_-4px_var(--glow-lime)] ' +
        (small ? 'size-7' : 'size-8')
      }
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo.png"
        alt=""
        className="h-full w-full select-none object-cover"
        draggable={false}
      />
    </span>
  );
}

function MealCard() {
  const macros = [
    { icon: Flame, label: 'kcal', value: MEAL.kcal },
    { icon: Droplets, label: 'protein', value: `${MEAL.protein}g` },
    { icon: Clock, label: 'carbs', value: `${MEAL.carbs}g` },
    { icon: Moon, label: 'fat', value: `${MEAL.fat}g` },
  ];
  return (
    <div className="overflow-hidden rounded-2xl rounded-bl-md border border-[var(--color-lime)]/25 bg-[var(--color-panel-2)] shadow-[0_10px_30px_-16px_var(--glass-shadow)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-lime)]/10 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-lime-dark)] dark:text-[var(--color-lime-light)]">
          {MEAL.tag}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[15px] font-semibold leading-snug text-[var(--color-foreground)]">
          {MEAL.name}
        </p>
        <dl className="mt-3 grid grid-cols-4 gap-2">
          {macros.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="flex flex-col items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-1 py-2 text-center"
              >
                <Icon className="size-3.5 text-[var(--color-lime)]" aria-hidden="true" />
                <dd className="text-sm font-bold leading-none text-[var(--color-foreground)]">
                  {m.value}
                </dd>
                <dt className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  {m.label}
                </dt>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.from === 'user';

  const inner =
    bubble.kind === 'meal' ? (
      <MealCard />
    ) : (
      <div
        className={
          'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ' +
          (isUser
            ? 'rounded-br-md bg-[var(--color-lime)] text-[var(--color-ink)]'
            : 'rounded-bl-md border border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-foreground)]')
        }
      >
        {bubble.text}
      </div>
    );

  return (
    <div
      className={
        'flex w-full items-end gap-2 ' + (isUser ? 'justify-end' : 'justify-start')
      }
    >
      {!isUser && <RiaAvatar small />}
      <div className={'flex max-w-[82%] flex-col gap-1 ' + (isUser ? 'items-end' : 'items-start')}>
        {inner}
        <span className="px-1 text-[10px] text-[var(--color-muted-foreground)]">
          {isUser ? 'You' : 'Ria'} · {bubble.at}
        </span>
      </div>
    </div>
  );
}

/** The playing chat transcript — reveals messages/typing on a timeline once in view. */
function ChatTranscript() {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();

  const [visible, setVisible] = React.useState(0);
  const [typing, setTyping] = React.useState(false);

  React.useEffect(() => {
    if (!inView) return;

    if (reduce) {
      setVisible(SCRIPT.length);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;

    SCRIPT.forEach((step, i) => {
      if (step.typingBefore) {
        const startTyping = t + step.delay;
        timers.push(setTimeout(() => setTyping(true), startTyping));
        t = startTyping + step.typingBefore;
        timers.push(
          setTimeout(() => {
            setTyping(false);
            setVisible(i + 1);
          }, t),
        );
      } else {
        t += step.delay;
        const at = t;
        timers.push(setTimeout(() => setVisible(i + 1), at));
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [inView, reduce]);

  return (
    <div
      ref={ref}
      className="flex flex-col gap-4"
      role="log"
      aria-label="Sample conversation with Ria, the AI coach"
    >
      {SCRIPT.slice(0, visible).map((step) => (
        <motion.div
          key={step.bubble.id}
          initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChatBubble bubble={step.bubble} />
        </motion.div>
      ))}

      {typing && !reduce && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Typing />
        </motion.div>
      )}
    </div>
  );
}

/** The phone shell with a chat header, the transcript, and a decorative composer. */
function RiaPhone() {
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      {/* ambient lime glow behind the device */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 blur-3xl"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 30%, rgba(168,204,60,0.24), transparent 70%)',
        }}
      />

      <div
        className="glass gradient-border relative overflow-hidden rounded-[var(--radius-2xl)]"
        role="img"
        aria-label="A phone showing the Ria AI coach chat: a night-shift nurse asks about eating at 3am and Ria replies with chrono-nutrition advice and a suggested meal."
      >
        <div className="grid-bg absolute inset-0 opacity-40" aria-hidden="true" />

        {/* chat header */}
        <div className="relative flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-panel)]/60 px-4 py-3 backdrop-blur">
          <RiaAvatar />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold leading-none text-[var(--color-foreground)]">
              Ria
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-lime)]/12 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-lime-dark)] dark:text-[var(--color-lime-light)]">
                <Sparkles className="size-2.5" aria-hidden="true" /> AI coach
              </span>
            </p>
            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
              <span className="size-1.5 rounded-full bg-[var(--color-lime)]" aria-hidden="true" />
              Online · tuned to your rota
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Night shift
          </span>
        </div>

        {/* transcript */}
        <div className="relative min-h-[420px] px-4 py-5">
          <ChatTranscript />
        </div>

        {/* composer (decorative / non-functional) */}
        <div className="relative border-t border-[var(--color-border)] bg-[var(--color-panel)]/60 px-3 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5">
              <span className="flex-1 truncate text-sm text-[var(--color-muted-foreground)]">
                Ask Ria anything…
              </span>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-lime)]"
              >
                <Mic className="size-4" />
              </button>
            </div>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Send (demo)"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] shadow-[0_8px_24px_-8px_rgba(168,204,60,0.7)] transition-transform hover:scale-105 active:scale-95"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CAPABILITIES = [
  {
    icon: Clock,
    title: 'Chrono-timed advice',
    body: 'Ria reads your real rota and times meals, caffeine cut-offs and training to your circadian clock — not a textbook 9-to-5.',
  },
  {
    icon: Sparkles,
    title: 'Plans on demand',
    body: 'Ask for a meal plan, a swap, or a macro target and Ria builds it instantly from your 8,600+ food database and 300+ recipes.',
  },
  {
    icon: Mic,
    title: 'Chat or voice, 24/7',
    body: 'Type at 3am or talk hands-free mid-shift. Ria answers in seconds and remembers your goals, allergies and preferences.',
  },
];

export function RiaDemo() {
  return (
    <section id="ria" className="relative overflow-hidden">
      {/* BackgroundBeams live in a relative container behind the section */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <BackgroundBeams />
      </div>

      <SectionShell
        align="left"
        className="relative"
        eyebrow={
          <>
            <Sparkles className="size-3.5" /> Your AI coach
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <MagneticText text="MEET RIA" hoverText="YOUR COACH" />
            <span className="text-[var(--color-muted-foreground)]">
              on <GradientText>every shift</GradientText>
            </span>
          </span>
        }
        subtitle="Ria is the coach in your pocket — chat or voice, any hour. Watch a real night-shift moment: it’s 3am, you’re starving, and Ria knows exactly what your body needs."
      >
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: the animated Ria chat phone */}
          <Reveal y={28}>
            <RiaPhone />
          </Reveal>

          {/* Right: what Ria can do */}
          <div className="flex flex-col gap-6">
            <Reveal y={22}>
              <Badge variant="outline">Powered by chrono-nutrition</Badge>
            </Reveal>

            <Reveal as="ul" stagger className="flex flex-col gap-4">
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                return (
                  <Reveal.Item as="li" key={c.title}>
                    <div className="glass flex gap-4 rounded-[var(--radius-2xl)] p-5">
                      <span
                        className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-lime)]"
                        aria-hidden="true"
                      >
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold leading-tight text-[var(--color-foreground)]">
                          {c.title}
                        </h3>
                        <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  </Reveal.Item>
                );
              })}
            </Reveal>

            <Reveal y={20}>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No two shifts are the same — and neither are Ria&apos;s answers.
              </p>
            </Reveal>
          </div>
        </div>
      </SectionShell>
    </section>
  );
}
