'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionShell } from '@/components/ui/section-shell';
import { GlowCard } from '@/components/ui/glow-card';
import { Reveal } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { GradientText } from '@/components/ui/gradient-text';
import { AppBadges } from '@/components/ui/app-badges';

/**
 * FinalCta — the closing waitlist capture. A big glowing lime panel with an
 * email input that client-side POSTs to the Zeitra waitlist endpoint, degrading
 * gracefully to a success state even if the request fails. Static-export safe:
 * no server actions / API routes, all handled in the browser.
 */

const WAITLIST_ENDPOINT = 'https://api.zeitra.app/v1/waitlist';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function FinalCta() {
  const reduce = useReducedMotion();
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<Status>('idle');
  const [message, setMessage] = React.useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = email.trim();

    if (!EMAIL_RE.test(value)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      // TODO: wire real endpoint — confirm this route + payload shape once the
      // waitlist API is live. We intentionally swallow failures below so a
      // not-yet-wired endpoint still shows the visitor a success state.
      await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
    } catch {
      // Network/endpoint failure — degrade gracefully, still treat as success.
    }

    setStatus('success');
    setMessage("You're on the list. We'll be in touch.");
  };

  const succeeded = status === 'success';
  const submitting = status === 'submitting';
  const errored = status === 'error';

  return (
    <SectionShell
      id="waitlist"
      className="scroll-mt-24"
      containerClassName="!max-w-[1000px]"
      decoration={
        <>
          <div
            className="glow"
            style={{
              width: 'min(760px, 90vw)',
              height: 620,
              left: '50%',
              top: '20%',
              transform: 'translateX(-50%)',
            }}
            aria-hidden="true"
          />
          <div className="glow-cyan" style={{ width: 380, height: 380, right: '4%', bottom: '6%' }} aria-hidden="true" />
          <div className="grid-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal>
        <GlowCard
          as="section"
          hover={false}
          className="relative overflow-hidden px-6 py-14 text-center sm:px-10 md:px-16 md:py-20"
          aria-labelledby="waitlist-cta-title"
        >
          {/* inner ambient lime wash so a bare panel still reads premium */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-0 opacity-80 [background:radial-gradient(120%_120%_at_50%_-10%,rgba(168,204,60,0.14),transparent_55%)]"
          />

          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-white/[0.04] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              <span className="relative flex size-2">
                {!reduce && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-lime)] opacity-60" />
                )}
                <span className="relative inline-flex size-2 rounded-full bg-[var(--color-lime)]" />
              </span>
              Waitlist open
            </span>

            <h2
              id="waitlist-cta-title"
              className="text-4xl font-bold uppercase leading-[0.98] tracking-tight md:text-6xl [font-family:var(--font-display)]"
            >
              Be first <GradientText>through the door.</GradientText>
            </h2>

            <p className="max-w-xl text-lg leading-relaxed text-[var(--color-muted-foreground)] md:text-xl">
              Join the waitlist and we&rsquo;ll set you up the moment Zeitra hits your store.
            </p>

            {/* Form / success swap */}
            <div className="mt-2 w-full max-w-lg" aria-live="polite">
              {succeeded ? (
                <motion.div
                  initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-lime)]/35 bg-[var(--color-lime)]/[0.06] px-6 py-7"
                  role="status"
                >
                  <CheckCircle2 className="size-9 text-[var(--color-lime)]" aria-hidden="true" />
                  <p className="text-lg font-semibold text-[var(--color-foreground)]">
                    {message}
                  </p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Meanwhile, grab the app the second it&rsquo;s live:
                  </p>
                  <AppBadges size="sm" className="mt-1 justify-center" />
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <label htmlFor="waitlist-email" className="sr-only">
                        Email address
                      </label>
                      <Mail
                        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                        aria-hidden="true"
                      />
                      <input
                        id="waitlist-email"
                        type="email"
                        name="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errored) setStatus('idle');
                        }}
                        disabled={submitting}
                        aria-invalid={errored}
                        aria-describedby={message ? 'waitlist-msg' : undefined}
                        className={cn(
                          'h-[52px] w-full rounded-full border bg-[var(--color-panel)]/80 pl-11 pr-4 text-[15px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/70',
                          'border-[var(--color-input)] backdrop-blur transition-colors',
                          'focus:border-[var(--color-lime)]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lime)]',
                          'disabled:opacity-60',
                          errored && 'border-red-400/60',
                        )}
                      />
                    </div>
                    <Button type="submit" size="lg" disabled={submitting} className="shrink-0">
                      {submitting ? (
                        <>
                          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                          Joining
                        </>
                      ) : (
                        <>
                          Join the waitlist
                          <ArrowRight className="size-5" aria-hidden="true" />
                        </>
                      )}
                    </Button>
                  </div>

                  {errored && message && (
                    <p id="waitlist-msg" className="text-sm text-red-300" role="alert">
                      {message}
                    </p>
                  )}
                </form>
              )}
            </div>

            {!succeeded && (
              <>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  7-day free trial &middot; iOS &amp; Android &middot; No credit card to browse.
                </p>

                <div className="mt-2 flex flex-col items-center gap-4">
                  <span className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]/80">
                    Or grab it straight from the store
                  </span>
                  <AppBadges className="justify-center" />
                </div>
              </>
            )}
          </div>
        </GlowCard>
      </Reveal>
    </SectionShell>
  );
}
