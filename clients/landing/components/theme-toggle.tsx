'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * Small glass icon button that flips between the dark and light themes.
 *
 * next-themes reads the active theme only on the client, so we gate the icon
 * behind a `mounted` flag to avoid a hydration mismatch (server render can't know
 * the resolved theme). Until mounted we render a neutral placeholder of the same
 * size so the nav layout never shifts.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  const base = cn(
    'inline-flex size-10 items-center justify-center rounded-lg',
    'border border-[var(--color-border-strong)] bg-[var(--color-panel-2)]/60',
    'text-[var(--color-foreground)] backdrop-blur-md transition-colors',
    'hover:border-[var(--color-lime)]/50 hover:text-[var(--color-lime)]',
    'focus-visible:outline-none',
    className,
  );

  if (!mounted) {
    // Placeholder keeps layout stable pre-hydration; hidden from AT.
    return <span aria-hidden="true" className={base} />;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={base}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

export default ThemeToggle;
