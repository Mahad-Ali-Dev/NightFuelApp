import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Button — the site's primary action element. Renders a <button> by default,
 * or any element you pass via `asChild`-style `as` (kept simple: pass `href`
 * to get an <a>). Static-export safe; no client hooks, so it can live in
 * server components.
 *
 *   <Button variant="primary" size="lg">Get the app</Button>
 *   <Button as="a" href="/#waitlist" variant="secondary">Join the waitlist</Button>
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold ' +
  'transition-[transform,background-color,border-color,box-shadow,color] duration-200 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lime)] ' +
  'disabled:pointer-events-none disabled:opacity-50 select-none active:translate-y-px ' +
  '[&_svg]:shrink-0';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-lime)] text-[var(--color-ink)] shadow-[0_10px_30px_-10px_rgba(168,204,60,0.6)] ' +
    'hover:bg-[var(--color-lime-light)] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(168,204,60,0.75)]',
  secondary:
    'border border-[var(--color-border-strong)] bg-[var(--control-surface)] text-[var(--color-foreground)] ' +
    'backdrop-blur hover:bg-[var(--control-surface-hover)] hover:border-[var(--color-lime)]/50 hover:-translate-y-0.5',
  ghost:
    'text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:bg-[var(--control-surface-hover)]',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-[15px]',
  lg: 'h-13 px-8 text-base [&_svg]:size-5 h-[52px]',
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    as?: 'button';
  };

type ButtonAsAnchor = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    as: 'a';
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', className, children, ...rest } = props;
  const classes = cn(base, variants[variant], sizes[size], className);

  if (props.as === 'a') {
    const { as: _as, ...anchorRest } = rest as ButtonAsAnchor;
    return (
      <a className={classes} {...anchorRest}>
        {children}
      </a>
    );
  }

  const { as: _as, ...buttonRest } = rest as ButtonAsButton;
  return (
    <button className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
