'use client';

import * as React from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Site header — sticky, backdrop-blurred top nav. Wordmark "Zeitra" with a lime
 * dot, anchor links (Features / How it works / Science / Pricing / FAQ), and a
 * "Get the app" CTA. A mobile hamburger toggles an accessible drop panel.
 *
 * Client component: uses local menu state + a scroll listener to condense the
 * bar. Static-export safe.
 */

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#app-tour', label: 'Tour' },
  { href: '#science', label: 'Science' },
  { href: '#ria', label: 'Ria' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

function Wordmark() {
  return (
    <a
      href="#top"
      aria-label="Zeitra home"
      className="group inline-flex items-center gap-2 text-2xl font-bold uppercase tracking-tight [font-family:var(--font-display)]"
    >
      <img
        src="/images/logo.png"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="size-7 shrink-0 object-contain"
      />
      <span>Zeitra</span>
      <span
        aria-hidden="true"
        className="mb-1 size-2 self-end rounded-full bg-[var(--color-lime)] shadow-[0_0_12px_2px_rgba(168,204,60,0.6)] transition-transform group-hover:scale-125"
      />
    </a>
  );
}

export default function Nav(_props: { active?: string } = {}) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav
        className="container-x flex h-16 items-center justify-between md:h-20"
        aria-label="Primary"
      >
        <Wordmark />

        {/* desktop links */}
        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Button as="a" href="#waitlist" variant="primary" size="sm">
            Get the app
          </Button>
        </div>

        {/* mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-panel-2)]/60 text-[var(--color-foreground)] backdrop-blur-md"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {/* mobile panel */}
      <div
        id="mobile-menu"
        hidden={!open}
        className={cn(
          'md:hidden',
          'border-t border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur-xl',
        )}
      >
        <ul className="container-x flex flex-col gap-1 py-4">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-base font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              >
                {l.label}
              </a>
            </li>
          ))}
          <li className="mt-2 px-3">
            <Button
              as="a"
              href="#waitlist"
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Get the app
            </Button>
          </li>
        </ul>
      </div>
    </header>
  );
}
