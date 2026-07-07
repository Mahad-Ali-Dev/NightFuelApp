'use client';

import * as React from 'react';
import {
  useInView,
  useReducedMotion,
  animate,
} from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * StatCounter — animates a number from 0 → `value` when scrolled into view.
 * Supports a `prefix`/`suffix` (e.g. "+", "B", "K"), decimals, and thousands
 * separators. Under prefers-reduced-motion it renders the final value instantly.
 *
 *   <StatCounter value={1.8} decimals={1} suffix="B" />
 *   <StatCounter value={8600} separator suffix="+" />
 */
export interface StatCounterProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  /** Text before the number, e.g. "$". */
  prefix?: string;
  /** Text after the number, e.g. "B", "+", "K". */
  suffix?: string;
  /** Decimal places. Default 0. */
  decimals?: number;
  /** Insert thousands separators (locale grouping). Default false. */
  separator?: boolean;
  /** Animation duration in seconds. Default 1.8. */
  duration?: number;
}

export function StatCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  separator = false,
  duration = 1.8,
  className,
  ...rest
}: StatCounterProps) {
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const numRef = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(wrapRef, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();

  const format = React.useCallback(
    (n: number) => {
      const fixed = n.toFixed(decimals);
      if (!separator) return fixed;
      const [int, frac] = fixed.split('.');
      const grouped = Number(int).toLocaleString('en-US');
      return frac ? `${grouped}.${frac}` : grouped;
    },
    [decimals, separator],
  );

  React.useEffect(() => {
    const el = numRef.current;
    if (!el) return;

    if (reduce || !inView) {
      if (reduce) el.textContent = format(value);
      return;
    }

    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        el.textContent = format(latest);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration, format]);

  return (
    <span
      ref={wrapRef}
      className={cn('tabular-nums', className)}
      role="text"
      aria-label={`${prefix}${format(value)}${suffix}`}
      {...rest}
    >
      <span aria-hidden="true">
        {prefix}
        <span ref={numRef}>{format(0)}</span>
        {suffix}
      </span>
    </span>
  );
}
