'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * GlowCard — the workhorse glass tile: `.glass` surface + `.gradient-border`
 * ring + a soft hover lift and an optional pointer-tracked lime glow. Used for
 * bento tiles, persona cards, testimonial cards, pricing cards.
 *
 *   <GlowCard className="p-6">…</GlowCard>
 *   <GlowCard as="article" spotlight highlight className="p-8">…</GlowCard>
 *
 * `highlight` = a stronger lime border (for the "best value" pricing tile).
 * `spotlight` = pointer-follow radial glow on the surface.
 * `hover`     = enable the lift (default true).
 */
export interface GlowCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  as?: 'div' | 'article' | 'li' | 'section';
  highlight?: boolean;
  spotlight?: boolean;
  hover?: boolean;
  children?: React.ReactNode;
}

export function GlowCard({
  as = 'div',
  highlight = false,
  spotlight = false,
  hover = true,
  className,
  children,
  onMouseMove,
  style,
  ...rest
}: GlowCardProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const MotionTag = motion[as] as typeof motion.div;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(e);
    if (!spotlight || reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <MotionTag
      ref={ref}
      onMouseMove={handleMove}
      whileHover={hover && !reduce ? { y: -6 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={cn(
        'glass gradient-border group relative overflow-hidden isolate',
        'transition-shadow duration-300 hover:shadow-[0_36px_80px_-40px_rgba(0,0,0,0.85)]',
        highlight &&
          '[&::before]:!bg-[linear-gradient(135deg,rgba(168,204,60,0.9),rgba(0,212,170,0.5)_50%,rgba(168,204,60,0.35))] shadow-[0_0_60px_-20px_rgba(168,204,60,0.55)]',
        className,
      )}
      style={style}
      {...rest}
    >
      {spotlight && !reduce && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 [background:radial-gradient(240px_circle_at_var(--mx,50%)_var(--my,50%),rgba(168,204,60,0.14),transparent_70%)] group-hover:opacity-100"
        />
      )}
      <div className="relative z-10">{children}</div>
    </MotionTag>
  );
}
