import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge / Pill — a small eyebrow chip used above section titles and inline
 * for labels. `variant="lime"` for the glowing accent pill, `outline` for a
 * quiet glass chip. Server-safe.
 *
 *   <Badge variant="lime">Chrono-nutrition</Badge>
 *   <Badge variant="outline"><Sparkles className="size-3.5" /> New</Badge>
 */

export type BadgeVariant = 'lime' | 'outline' | 'solid';

const base =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ' +
  'uppercase tracking-[0.14em] leading-none [&_svg]:size-3.5';

const variants: Record<BadgeVariant, string> = {
  lime:
    'border border-[var(--color-lime)]/30 bg-[var(--color-lime)]/10 text-[var(--color-lime-light)] ' +
    'shadow-[0_0_20px_-6px_rgba(168,204,60,0.5)]',
  outline:
    'border border-[var(--color-border-strong)] bg-white/[0.03] text-[var(--color-muted-foreground)] backdrop-blur',
  solid: 'bg-[var(--color-lime)] text-[var(--color-ink)]',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'lime', className, ...props }: BadgeProps) {
  return <span className={cn(base, variants[variant], className)} {...props} />;
}
