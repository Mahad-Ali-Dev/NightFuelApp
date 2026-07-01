'use client';

import * as React from 'react';
import {
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
} from 'framer-motion';

/**
 * Reveal — framer-motion scroll-reveal wrapper (fade + rise). Animates once
 * when it scrolls into view. Fully respects prefers-reduced-motion (renders
 * static, no transform). Use it around any block you want to animate in.
 *
 *   <Reveal>…</Reveal>
 *   <Reveal as="li" delay={0.1} y={30}>…</Reveal>
 *   <Reveal as="ul" stagger>{items.map(...)}</Reveal>   // children auto-stagger
 *
 * `stagger` turns children into staggered items — wrap each child in
 * <Reveal.Item> to opt them into the parent's stagger timeline.
 */

type MotionTag = 'div' | 'section' | 'ul' | 'li' | 'span' | 'article' | 'header' | 'p';

export interface RevealProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  as?: MotionTag;
  /** Vertical rise distance in px (default 24). */
  y?: number;
  /** Delay in seconds. */
  delay?: number;
  /** Animation duration in seconds (default 0.7). */
  duration?: number;
  /** Enable child stagger orchestration (children use <Reveal.Item>). */
  stagger?: boolean;
  /** Amount of element in view before firing (0–1). */
  amount?: number;
  once?: boolean;
  children?: React.ReactNode;
}

const EASE = [0.16, 1, 0.3, 1] as const;

function RevealRoot({
  as = 'div',
  y = 24,
  delay = 0,
  duration = 0.7,
  stagger = false,
  amount = 0.2,
  once = true,
  children,
  ...rest
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, amount });
  const reduce = useReducedMotion();

  const MotionTag = motion[as] as typeof motion.div;

  if (reduce) {
    return (
      <MotionTag ref={ref} {...rest}>
        {children}
      </MotionTag>
    );
  }

  if (stagger) {
    return (
      <MotionTag
        ref={ref}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.09, delayChildren: delay } },
        }}
        {...rest}
      >
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/** A single staggered child; use inside a <Reveal stagger> parent. */
function RevealItem({
  as = 'div',
  y = 24,
  children,
  ...rest
}: Omit<RevealProps, 'stagger' | 'delay' | 'once' | 'amount'>) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;

  if (reduce) {
    return <MotionTag {...rest}>{children}</MotionTag>;
  }

  return (
    <MotionTag
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

export const Reveal = Object.assign(RevealRoot, { Item: RevealItem });
