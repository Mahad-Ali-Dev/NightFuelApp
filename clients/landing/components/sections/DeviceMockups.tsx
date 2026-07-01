import * as React from 'react';
import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { AppBadges } from '@/components/ui/app-badges';
import { Reveal } from '@/components/ui/reveal';

/**
 * DeviceMockups — the "iOS AND Android" showcase.
 *
 * Two hand-built CSS phone shells sit side by side: a rounded iPhone with a
 * dynamic-island notch, and a squarer Android with a hole-punch camera. A third
 * device floats behind/between them for depth. Every screen is a REAL Zeitra
 * screenshot from /images/screens/*. An ambient lime glow washes behind the
 * cluster. Fully responsive (stacks on mobile), theme-aware via --color-* vars.
 *
 * Server-safe: no client hooks, pure CSS/SVG chrome + static <img> screens.
 */

const STATUS_TIME = '9:41';

/* iPhone status-bar glyphs (signal / wifi / battery) — pure SVG, currentColor. */
function IosStatusIcons() {
  return (
    <div className="flex items-center gap-1.5 text-white/90">
      <svg viewBox="0 0 18 12" className="h-2.5 w-auto" fill="currentColor" aria-hidden="true">
        <rect x="0" y="8" width="3" height="4" rx="0.6" />
        <rect x="5" y="5" width="3" height="7" rx="0.6" />
        <rect x="10" y="2.5" width="3" height="9.5" rx="0.6" />
        <rect x="15" y="0" width="3" height="12" rx="0.6" />
      </svg>
      <svg viewBox="0 0 16 12" className="h-2.5 w-auto" fill="currentColor" aria-hidden="true">
        <path d="M8 2.2c2.5 0 4.8.95 6.5 2.5l-1.3 1.4A7.6 7.6 0 0 0 8 4.2 7.6 7.6 0 0 0 2.8 6.1L1.5 4.7A9.6 9.6 0 0 1 8 2.2Zm0 3.4c1.5 0 2.9.55 3.9 1.5l-1.35 1.4A3.9 3.9 0 0 0 8 7.4c-.95 0-1.8.35-2.55.9L4.1 6.9A5.9 5.9 0 0 1 8 5.6Zm0 3.3c.7 0 1.3.26 1.75.7L8 11.5 6.25 9.6c.45-.44 1.05-.7 1.75-.7Z" />
      </svg>
      <svg viewBox="0 0 26 12" className="h-2.5 w-auto" aria-hidden="true">
        <rect x="0.5" y="0.5" width="21" height="11" rx="2.6" fill="none" stroke="currentColor" strokeOpacity="0.5" />
        <rect x="2" y="2" width="16" height="8" rx="1.4" fill="currentColor" />
        <rect x="23" y="3.5" width="1.8" height="5" rx="0.9" fill="currentColor" fillOpacity="0.5" />
      </svg>
    </div>
  );
}

/* Android status-bar glyphs (slightly different arrangement). */
function AndroidStatusIcons() {
  return (
    <div className="flex items-center gap-1.5 text-white/90">
      <svg viewBox="0 0 16 12" className="h-2.5 w-auto" fill="currentColor" aria-hidden="true">
        <path d="M8 2.2c2.5 0 4.8.95 6.5 2.5l-1.3 1.4A7.6 7.6 0 0 0 8 4.2 7.6 7.6 0 0 0 2.8 6.1L1.5 4.7A9.6 9.6 0 0 1 8 2.2Zm0 3.4c1.5 0 2.9.55 3.9 1.5l-1.35 1.4A3.9 3.9 0 0 0 8 7.4c-.95 0-1.8.35-2.55.9L4.1 6.9A5.9 5.9 0 0 1 8 5.6Zm0 3.3c.7 0 1.3.26 1.75.7L8 11.5 6.25 9.6c.45-.44 1.05-.7 1.75-.7Z" />
      </svg>
      <svg viewBox="0 0 18 12" className="h-2.5 w-auto" fill="currentColor" aria-hidden="true">
        <rect x="0" y="8" width="3" height="4" rx="0.6" />
        <rect x="5" y="5" width="3" height="7" rx="0.6" />
        <rect x="10" y="2.5" width="3" height="9.5" rx="0.6" />
        <rect x="15" y="0" width="3" height="12" rx="0.6" />
      </svg>
      <svg viewBox="0 0 26 12" className="h-2.5 w-auto" aria-hidden="true">
        <rect x="0.5" y="0.5" width="21" height="11" rx="2.6" fill="none" stroke="currentColor" strokeOpacity="0.5" />
        <rect x="2" y="2" width="16" height="8" rx="1.4" fill="currentColor" />
        <rect x="23" y="3.5" width="1.8" height="5" rx="0.9" fill="currentColor" fillOpacity="0.5" />
      </svg>
    </div>
  );
}

/* ── iPhone shell ─────────────────────────────────────────────────────────── */
function IPhone({
  src,
  alt,
  width = 268,
  className,
}: {
  src: string;
  alt: string;
  width?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ width }}
      role="img"
      aria-label={`iPhone showing the Zeitra ${alt}`}
    >
      {/* titanium rail — gradient rim that reads in both themes */}
      <div
        className="relative rounded-[3rem] p-[3px]"
        style={{
          background:
            'linear-gradient(150deg, rgba(255,255,255,0.28), rgba(168,204,60,0.22) 34%, rgba(255,255,255,0.04) 55%, rgba(0,0,0,0.45))',
          boxShadow:
            '0 50px 110px -45px rgba(0,0,0,0.85), 0 0 0 1px var(--hairline-strong)',
        }}
      >
        {/* bezel (near-black in both themes — real phone chrome) */}
        <div className="relative rounded-[2.8rem] bg-[#05060a] p-[9px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          {/* screen */}
          <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[2.25rem] bg-black">
            {/* dynamic island */}
            <div className="absolute left-1/2 top-2.5 z-30 flex h-[26px] w-[86px] -translate-x-1/2 items-center justify-end gap-2 rounded-full bg-black pr-2.5">
              <span className="size-1.5 rounded-full bg-white/10" />
              <span className="size-2 rounded-full bg-[#0b1a1a] ring-1 ring-white/10" />
            </div>

            {/* status bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 pt-[9px]">
              <span className="text-[11px] font-semibold tracking-tight text-white/90">{STATUS_TIME}</span>
              <IosStatusIcons />
            </div>

            {/* real screenshot */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-top"
            />

            {/* home indicator */}
            <div className="absolute bottom-2 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-white/70" />

            {/* glass sheen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.14), transparent 26%)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Android shell ───────────────────────────────────────────────────────── */
function AndroidPhone({
  src,
  alt,
  width = 268,
  className,
}: {
  src: string;
  alt: string;
  width?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ width }}
      role="img"
      aria-label={`Android phone showing the Zeitra ${alt}`}
    >
      {/* metal rail — squarer corners than the iPhone */}
      <div
        className="relative rounded-[2.1rem] p-[3px]"
        style={{
          background:
            'linear-gradient(150deg, rgba(255,255,255,0.24), rgba(0,212,170,0.2) 36%, rgba(255,255,255,0.03) 56%, rgba(0,0,0,0.45))',
          boxShadow:
            '0 50px 110px -45px rgba(0,0,0,0.85), 0 0 0 1px var(--hairline-strong)',
        }}
      >
        {/* bezel — thinner, uniform, squarer */}
        <div className="relative rounded-[1.95rem] bg-[#05060a] p-[7px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          {/* screen */}
          <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[1.55rem] bg-black">
            {/* hole-punch camera — centered dot near the top */}
            <div className="absolute left-1/2 top-[7px] z-30 size-2.5 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/15">
              <span className="absolute inset-[3px] rounded-full bg-[#0b1a1a]" />
            </div>

            {/* status bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-2">
              <span className="text-[11px] font-semibold tracking-tight text-white/90">{STATUS_TIME}</span>
              <AndroidStatusIcons />
            </div>

            {/* real screenshot */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-top"
            />

            {/* Android gesture pill */}
            <div className="absolute bottom-1.5 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-white/60" />

            {/* glass sheen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.12), transparent 26%)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* OS label chip shown under each hero device. */
function OsLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-white/[0.04] px-4 py-1.5 text-sm font-semibold text-[var(--color-foreground)] backdrop-blur">
      {children}
    </span>
  );
}

export function DeviceMockups() {
  return (
    <SectionShell
      id="mockups"
      eyebrow="iOS + Android"
      title={
        <>
          One app. <GradientText>Every phone.</GradientText>
        </>
      }
      subtitle="Zeitra ships native on iOS and Android — pixel-crisp, dark-first, and ready the moment your shift starts."
      decoration={
        <>
          {/* ambient lime glow behind the cluster */}
          <div
            aria-hidden="true"
            className="glow"
            style={{ width: 720, height: 720, left: '50%', top: '46%', transform: 'translate(-50%, -50%)' }}
          />
          <div
            aria-hidden="true"
            className="glow glow-cyan"
            style={{ width: 460, height: 460, right: '6%', top: '20%' }}
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      <Reveal className="relative">
        {/* device cluster */}
        <div className="relative flex flex-col items-center justify-center gap-14 md:flex-row md:items-end md:gap-8 lg:gap-16">
          {/* iPhone (left) */}
          <div className="relative flex flex-col items-center gap-5">
            <IPhone
              src="/images/screens/home.png"
              alt="Home screen"
              className="transition-transform duration-500 will-change-transform md:-rotate-[3deg] md:hover:rotate-0 md:hover:-translate-y-2"
            />
            <OsLabel>
              <svg viewBox="0 0 24 24" className="size-4 text-[var(--color-foreground)]" fill="currentColor" aria-hidden="true">
                <path d="M16.365 1.43c0 1.14-.417 2.213-1.243 3.078-.9.943-2.03 1.48-3.238 1.386-.14-1.09.415-2.242 1.213-3.06.885-.93 2.412-1.61 3.268-1.404zM20.86 17.02c-.55 1.27-.815 1.836-1.523 2.96-.988 1.57-2.38 3.523-4.106 3.54-1.532.015-1.927-.996-4.006-.985-2.08.011-2.512 1.003-4.045.988-1.726-.017-3.045-1.78-4.033-3.35C.77 18.56.36 14.68 1.99 12.02c.995-1.626 2.564-2.657 4.078-2.657 1.542 0 2.51 1.01 3.786 1.01 1.236 0 1.99-1.012 3.774-1.012 1.348 0 2.777.735 3.795 2.006-3.336 1.828-2.793 6.593.437 8.653z" />
              </svg>
              iPhone
            </OsLabel>
          </div>

          {/* Floating third device (behind, between) — hidden on small screens */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden -translate-x-1/2 -translate-y-[58%] opacity-70 blur-[0.4px] lg:block"
          >
            <AndroidPhone
              src="/images/screens/cycle-calendar.png"
              alt="Cycle calendar screen"
              width={224}
              className="rotate-[6deg] scale-95"
            />
          </div>

          {/* Android (right) */}
          <div className="relative z-10 flex flex-col items-center gap-5">
            <AndroidPhone
              src="/images/screens/meals.png"
              alt="Meals screen"
              className="transition-transform duration-500 will-change-transform md:rotate-[3deg] md:hover:rotate-0 md:hover:-translate-y-2"
            />
            <OsLabel>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                <path
                  d="M17.6 9.5 19.4 6.4a.4.4 0 0 0-.7-.4l-1.83 3.17A11 11 0 0 0 12 8c-1.75 0-3.4.42-4.87 1.17L5.3 6a.4.4 0 0 0-.7.4l1.8 3.1A9.4 9.4 0 0 0 1.5 17h21a9.4 9.4 0 0 0-4.9-7.5ZM7 14.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                  fill="#a8cc3c"
                />
              </svg>
              Android
            </OsLabel>
          </div>
        </div>

        {/* store badges */}
        <div className="mt-14 flex flex-col items-center gap-4">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Free 7-day trial · then $9.99/mo or $59/yr · cancel anytime
          </p>
          <AppBadges className="justify-center" />
        </div>
      </Reveal>
    </SectionShell>
  );
}
