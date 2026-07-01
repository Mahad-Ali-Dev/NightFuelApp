import * as React from 'react';
import { AppBadges } from '@/components/ui/app-badges';

/**
 * Site footer — brand blurb + app badges, three link columns (Product / Learn /
 * Company & legal), social placeholders, and the copyright base row. Plain
 * server component (no interactivity).
 */

type Col = { title: string; links: { href: string; label: string; ariaLabel?: string }[] };

const COLUMNS: Col[] = [
  {
    title: 'Product',
    links: [
      { href: '#features', label: 'Features' },
      { href: '#how', label: 'How it works' },
      { href: '#pricing', label: 'Pricing' },
      { href: '#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/support', label: 'Support' },
    ],
  },
];

const SOCIALS: { label: string; short: string }[] = [
  { label: 'Zeitra on Instagram (coming soon)', short: 'IG' },
  { label: 'Zeitra on X / Twitter (coming soon)', short: 'X' },
  { label: 'Zeitra on LinkedIn (coming soon)', short: 'in' },
  { label: 'Zeitra on TikTok (coming soon)', short: 'TT' },
];

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-1 text-2xl font-bold uppercase tracking-tight [font-family:var(--font-display)]">
      Zeitra
      <span
        aria-hidden="true"
        className="mb-1 size-2 self-end rounded-full bg-[var(--color-lime)] shadow-[0_0_12px_2px_rgba(168,204,60,0.55)]"
      />
    </span>
  );
}

export default function Footer() {
  return (
    <footer className="relative border-t border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="container-x py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* brand */}
          <div className="flex flex-col gap-5">
            <Wordmark />
            <p className="max-w-sm text-[var(--color-muted-foreground)]">
              Nutrition &amp; fitness that runs on your clock. The AI coach that times your
              meals, training, caffeine and sleep to when you actually work.
            </p>
            <AppBadges size="sm" />
            <ul className="mt-1 flex items-center gap-2">
              {SOCIALS.map((s) => (
                <li key={s.short}>
                  <a
                    href="#"
                    aria-label={s.label}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-white/[0.03] text-xs font-semibold text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-lime)]/40 hover:text-[var(--color-foreground)]"
                  >
                    {s.short}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* link columns */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-foreground)]">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      aria-label={l.ariaLabel}
                      className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-[var(--color-border)] pt-8 text-sm text-[var(--color-muted-foreground)] sm:flex-row sm:items-center">
          <span>&copy; Zeitra 2026. All rights reserved.</span>
          <span>Nutrition &amp; fitness that runs on your clock.</span>
        </div>
      </div>
    </footer>
  );
}
