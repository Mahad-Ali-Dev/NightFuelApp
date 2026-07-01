import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * AppBadges — App Store + Google Play download buttons rendered as pure SVG/CSS
 * (no external badge images). Hrefs are '#' placeholders with descriptive
 * aria-labels until real store URLs land. Server-safe.
 *
 *   <AppBadges />
 *   <AppBadges className="justify-center" size="sm" />
 */
export interface AppBadgesProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md';
  appStoreHref?: string;
  playStoreHref?: string;
}

function StoreBadge({
  href,
  label,
  top,
  bottom,
  icon,
  size,
}: {
  href: string;
  label: string;
  top: string;
  bottom: string;
  icon: React.ReactNode;
  size: 'sm' | 'md';
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className={cn(
        'group inline-flex items-center gap-3 rounded-xl border border-[var(--color-border-strong)]',
        'bg-white/[0.04] backdrop-blur transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[var(--color-lime)]/40 hover:bg-white/[0.08]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lime)]',
        size === 'sm' ? 'px-3.5 py-2' : 'px-4 py-2.5',
      )}
    >
      <span className={cn('shrink-0 text-[var(--color-foreground)]', size === 'sm' ? 'size-6' : 'size-7')}>
        {icon}
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {top}
        </span>
        <span className={cn('font-semibold', size === 'sm' ? 'text-sm' : 'text-base')}>
          {bottom}
        </span>
      </span>
    </a>
  );
}

const AppleIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-full" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.417 2.213-1.243 3.078-.9.943-2.03 1.48-3.238 1.386-.14-1.09.415-2.242 1.213-3.06.885-.93 2.412-1.61 3.268-1.404.03.06 0 .333 0 0zM20.86 17.02c-.55 1.27-.815 1.836-1.523 2.96-.988 1.57-2.38 3.523-4.106 3.54-1.532.015-1.927-.996-4.006-.985-2.08.011-2.512 1.003-4.045.988-1.726-.017-3.045-1.78-4.033-3.35C.77 18.56.36 14.68 1.99 12.02c.995-1.626 2.564-2.657 4.078-2.657 1.542 0 2.51 1.01 3.786 1.01 1.236 0 1.99-1.012 3.774-1.012 1.348 0 2.777.735 3.795 2.006-3.336 1.828-2.793 6.593.437 8.653z" />
  </svg>
);

const PlayIcon = (
  <svg viewBox="0 0 24 24" className="size-full" aria-hidden="true">
    <path d="M3.6 2.3 13.4 12 3.6 21.7c-.3-.2-.5-.6-.5-1.1V3.4c0-.5.2-.9.5-1.1z" fill="#00d4aa" />
    <path d="M16.9 8.5 13.4 12l3.5 3.5 3.7-2.1c.9-.5.9-1.8 0-2.3L16.9 8.5z" fill="#a8cc3c" />
    <path d="M3.6 2.3c.3-.2.7-.2 1.1 0L16.9 8.5 13.4 12 3.6 2.3z" fill="#c5e06b" />
    <path d="M3.6 21.7 13.4 12l3.5 3.5-12.2 6.2c-.4.2-.8.2-1.1 0z" fill="#93b82e" />
  </svg>
);

export function AppBadges({
  size = 'md',
  appStoreHref = '#',
  playStoreHref = '#',
  className,
  ...rest
}: AppBadgesProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)} {...rest}>
      <StoreBadge
        href={appStoreHref}
        label="Download Zeitra on the App Store (link coming soon)"
        top="Download on the"
        bottom="App Store"
        icon={AppleIcon}
        size={size}
      />
      <StoreBadge
        href={playStoreHref}
        label="Get Zeitra on Google Play (link coming soon)"
        top="Get it on"
        bottom="Google Play"
        icon={PlayIcon}
        size={size}
      />
    </div>
  );
}
