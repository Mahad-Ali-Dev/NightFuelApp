'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Marquee — a seamless horizontal scroller for logo / stat strips. Duplicates
 * its children once and slides -50% for a gapless loop (CSS `animate-marquee`,
 * defined in globals.css). Pauses on hover; halts entirely under
 * prefers-reduced-motion (handled by the CSS media query).
 *
 *   <Marquee speed={30} className="py-6">
 *     {items.map((t) => <Pill key={t}>{t}</Pill>)}
 *   </Marquee>
 */
export interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Loop duration in seconds (higher = slower). Default 32. */
  speed?: number;
  /** Reverse direction. */
  reverse?: boolean;
  /** Pause the animation while hovering. Default true. */
  pauseOnHover?: boolean;
  /** Gap between items (Tailwind gap class). Default 'gap-4'. */
  gapClassName?: string;
  children: React.ReactNode;
}

export function Marquee({
  speed = 32,
  reverse = false,
  pauseOnHover = true,
  gapClassName = 'gap-4',
  className,
  children,
  ...rest
}: MarqueeProps) {
  const track = (
    <div
      className={cn('flex shrink-0 items-center', gapClassName)}
      aria-hidden={undefined}
    >
      {children}
    </div>
  );

  return (
    <div
      className={cn('marquee-mask group relative w-full overflow-hidden', className)}
      {...rest}
    >
      <div
        className={cn(
          'flex w-max animate-marquee',
          gapClassName,
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
        style={{
          ['--marquee-duration' as string]: `${speed}s`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {track}
        {/* duplicate for seamless -50% loop; hidden from a11y tree */}
        <div className={cn('flex shrink-0 items-center', gapClassName)} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
