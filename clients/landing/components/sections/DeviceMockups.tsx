import * as React from 'react';
import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { AppBadges } from '@/components/ui/app-badges';
import { Reveal } from '@/components/ui/reveal';

/**
 * DeviceMockups — the "ONE APP. EVERY PHONE." showcase, now with REAL
 * on-device screenshots (/images/app) inside hand-built CSS phone shells:
 * an iPhone (Dynamic-Island pill) and an Android (centered hole-punch camera).
 * Both float gently; a subtle lime/cyan glow sits behind each. Stacks on
 * mobile. Server-safe — the float animation is pure CSS.
 */

/* OS label chip shown under each device. */
function OsLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-panel-2)]/60 px-4 py-1.5 text-sm font-semibold text-[var(--color-foreground)] backdrop-blur">
      {children}
    </span>
  );
}

/* ── CSS phone shell with a real screenshot inside ───────────────────────── */
function Phone({
  src,
  alt,
  os,
  glow,
  className,
}: {
  src: string;
  alt: string;
  os: 'ios' | 'android';
  glow: 'lime' | 'cyan';
  className?: string;
}) {
  return (
    <div className={'relative ' + (className ?? '')}>
      {/* ambient glow behind the device */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[92%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          background:
            glow === 'lime'
              ? 'radial-gradient(circle, color-mix(in oklab, var(--color-lime) 45%, transparent), transparent 70%)'
              : 'radial-gradient(circle, color-mix(in oklab, var(--color-cyan) 40%, transparent), transparent 70%)',
        }}
      />
      {/* shell */}
      <div className="phone-float relative rounded-[2.6rem] border border-black/20 bg-[#0b0d12] p-[10px] shadow-[0_45px_90px_-30px_rgba(10,14,8,0.55)] dark:border-white/10">
        {/* screen */}
        <div className="relative overflow-hidden rounded-[2rem] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="block w-full select-none"
            draggable={false}
          />
          {/* iOS Dynamic-Island pill / Android hole-punch camera */}
          {os === 'ios' ? (
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-2.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10"
            />
          ) : (
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-3 size-[14px] -translate-x-1/2 rounded-full bg-black ring-2 ring-black/80"
            />
          )}
        </div>
        {/* side button hints */}
        <div
          aria-hidden="true"
          className="absolute -right-[2px] top-24 h-16 w-[3px] rounded-full bg-black/50 dark:bg-white/15"
        />
      </div>
    </div>
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
      subtitle="Zeitra ships native on iOS and Android — these are real screens, straight off the device."
      decoration={
        <>
          <div
            aria-hidden="true"
            className="glow"
            style={{ width: 720, height: 720, left: '50%', top: '46%', transform: 'translate(-50%, -50%)' }}
          />
          <div className="dot-bg" aria-hidden="true" />
        </>
      }
    >
      {/* float keyframes (scoped, offset for a natural drift) */}
      <style>{`
        @keyframes zeitra-phone-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }
        .phone-float { animation: zeitra-phone-float 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .phone-float { animation: none; }
        }
      `}</style>

      <Reveal className="relative">
        {/* device cluster: iPhone (home) + Android (recipes) + a peeking third (rhythm) */}
        <div className="relative mx-auto flex max-w-4xl flex-col items-center justify-center gap-14 md:flex-row md:items-end md:gap-12 lg:gap-20">
          <div className="relative flex w-full max-w-[270px] flex-col items-center gap-6 md:max-w-[300px]">
            <Phone
              src="/images/app/home.webp"
              alt="Zeitra home on iPhone — tonight’s training, fat-loss challenge and pre-shift meal"
              os="ios"
              glow="lime"
              className="md:-rotate-[2.5deg]"
            />
            <OsLabel>
              <svg viewBox="0 0 24 24" className="size-4 text-[var(--color-foreground)]" fill="currentColor" aria-hidden="true">
                <path d="M16.365 1.43c0 1.14-.417 2.213-1.243 3.078-.9.943-2.03 1.48-3.238 1.386-.14-1.09.415-2.242 1.213-3.06.885-.93 2.412-1.61 3.268-1.404zM20.86 17.02c-.55 1.27-.815 1.836-1.523 2.96-.988 1.57-2.38 3.523-4.106 3.54-1.532.015-1.927-.996-4.006-.985-2.08.011-2.512 1.003-4.045.988-1.726-.017-3.045-1.78-4.033-3.35C.77 18.56.36 14.68 1.99 12.02c.995-1.626 2.564-2.657 4.078-2.657 1.542 0 2.51 1.01 3.786 1.01 1.236 0 1.99-1.012 3.774-1.012 1.348 0 2.777.735 3.795 2.006-3.336 1.828-2.793 6.593.437 8.653z" />
              </svg>
              iPhone / iOS
            </OsLabel>
          </div>

          <div className="relative flex w-full max-w-[270px] flex-col items-center gap-6 md:max-w-[300px]">
            <Phone
              src="/images/app/recipes.webp"
              alt="Ria’s Kitchen on Android — chef-crafted recipes with calories and macros"
              os="android"
              glow="lime"
              className="md:rotate-[2.5deg] [&_.phone-float]:[animation-delay:-3s]"
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

          {/* peeking third device (desktop only) — the chrono rhythm timeline */}
          <div className="pointer-events-none absolute -right-10 bottom-16 hidden w-[190px] opacity-90 lg:block" aria-hidden="true">
            <Phone
              src="/images/app/rhythm.webp"
              alt=""
              os="android"
              glow="lime"
              className="rotate-[7deg] [&_.phone-float]:[animation-delay:-1.5s]"
            />
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
