'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Scroll-reveal wrapper that mirrors the behavior in the legacy `app.js`:
 * an IntersectionObserver with threshold 0.12 adds the `in` class on
 * intersect (which the existing `[data-reveal].in` CSS animates), then
 * unobserves. When IntersectionObserver is unavailable the element is
 * revealed immediately.
 */
export function Reveal({
  children,
  className,
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      el.classList.add('in');
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref} data-reveal className={className} {...rest}>
      {children}
    </Component>
  );
}
