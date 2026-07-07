'use client';

import * as React from 'react';
import { Menu, X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Site header — a premium, LIGHT-FIRST sticky bar with smooth framer-motion
 * animations:
 *  - tasteful entrance on mount (bar slides + fades down)
 *  - elegantly condenses on scroll (height + shadow + backdrop blur transition)
 *  - a lime indicator pill that slides under the hovered/focused desktop link
 *    (framer-motion `layoutId` shared-layout animation)
 *  - animated mobile panel open/close (height + fade, staggered rows)
 *
 * All colors resolve from the semantic --color-* tokens so it stays crisp in
 * both themes (tuned for light). Static-export safe (client component).
 */

const LINKS = [
  // Root-anchored so the anchors also work from /blog, /privacy, etc.
  { href: '/#features', label: 'Features' },
  { href: '/#app-tour', label: 'Tour' },
  { href: '/#science', label: 'Science' },
  { href: '/#ria', label: 'Ria' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/#faq', label: 'FAQ' },
] as const;

function Wordmark() {
  return (
    <a
      href="#top"
      aria-label="Zeitra home"
      className="group inline-flex items-center gap-2 text-2xl font-bold uppercase tracking-tight [font-family:var(--font-display)]"
    >
      <motion.img
        src="/images/logo.png"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="size-7 shrink-0 object-contain"
        whileHover={{ rotate: -8, scale: 1.08 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      />
      <span className="transition-colors group-hover:text-[var(--color-foreground)]">
        Zeitra
      </span>
      <span
        aria-hidden="true"
        className="mb-1 size-2 self-end rounded-full bg-[var(--color-lime)] shadow-[0_0_12px_2px_rgba(168,204,60,0.55)] transition-transform duration-300 group-hover:scale-125"
      />
    </a>
  );
}

/** Desktop link with a shared-layout lime indicator that slides under the
 *  hovered/focused item. */
function DesktopLinks() {
  const [hovered, setHovered] = React.useState<string | null>(null);

  return (
    <ul
      className="hidden items-center gap-1 md:flex"
      onMouseLeave={() => setHovered(null)}
    >
      {LINKS.map((l) => (
        <li key={l.href} className="relative">
          <a
            href={l.href}
            onMouseEnter={() => setHovered(l.href)}
            onFocus={() => setHovered(l.href)}
            onBlur={() => setHovered(null)}
            className={cn(
              'relative block rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200',
              hovered === l.href
                ? 'text-[var(--color-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {hovered === l.href && (
              <motion.span
                layoutId="nav-indicator"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-[var(--color-lime)]/12 ring-1 ring-inset ring-[var(--color-lime)]/25"
                transition={{ type: 'spring', stiffness: 500, damping: 34, mass: 0.6 }}
              />
            )}
            <span className="relative">{l.label}</span>
            {/* Sliding lime underline that tracks the hovered link. */}
            {hovered === l.href && (
              <motion.span
                layoutId="nav-underline"
                aria-hidden="true"
                className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--color-lime)]"
                transition={{ type: 'spring', stiffness: 500, damping: 34, mass: 0.6 }}
              />
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function Nav(_props: { active?: string } = {}) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const reduceMotion = useReducedMotion();

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

  const panelVariants: Variants = {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: 'auto',
      transition: {
        height: { type: 'spring', stiffness: 320, damping: 34 },
        opacity: { duration: 0.2 },
        staggerChildren: 0.05,
        delayChildren: 0.06,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.15 },
      },
    },
  };

  const rowVariants: Variants = {
    hidden: { opacity: 0, y: -8 },
    show: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  };

  return (
    <motion.header
      initial={reduceMotion ? false : { y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <motion.div
        className={cn(
          'transition-[background-color,border-color,box-shadow] duration-300',
          scrolled
            ? 'border-b border-[var(--color-border)] bg-[var(--color-background)]/75 shadow-[0_10px_30px_-24px_var(--glass-shadow)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-[var(--color-background)]/65'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <nav
          className={cn(
            'container-x flex items-center justify-between transition-[height] duration-300',
            scrolled ? 'h-14 md:h-16' : 'h-16 md:h-20',
          )}
          aria-label="Primary"
        >
          <Wordmark />

          {/* desktop links with animated indicator */}
          <DesktopLinks />

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
              className="inline-flex size-10 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--control-surface)] text-[var(--color-foreground)] backdrop-blur-md transition-colors hover:border-[var(--color-lime)]/50"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={open ? 'x' : 'menu'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex"
                >
                  {open ? <X className="size-5" /> : <Menu className="size-5" />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </nav>

        {/* mobile panel */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id="mobile-menu"
              key="mobile-menu"
              variants={panelVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur-xl md:hidden"
            >
              <ul className="container-x flex flex-col gap-1 py-4">
                {LINKS.map((l) => (
                  <motion.li key={l.href} variants={rowVariants}>
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-3 text-base font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-lime)]/10 hover:text-[var(--color-foreground)]"
                    >
                      {l.label}
                    </a>
                  </motion.li>
                ))}
                <motion.li variants={rowVariants} className="mt-2 px-3">
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
                </motion.li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.header>
  );
}
