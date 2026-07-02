import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/ui/reveal';

/**
 * SectionShell — the standard section wrapper every marketing section is built
 * on. Renders a semantic <section id> with consistent `.section` padding + a
 * `.container-x` gutter, and an optional revealed header (eyebrow pill / title /
 * subtitle). Pass `align="center"` (default) or `"left"`.
 *
 * The header is wrapped in <Reveal> automatically. Section body content is the
 * children — wrap your own inner blocks in <Reveal> as needed.
 *
 *   <SectionShell
 *     id="features"
 *     eyebrow="The product"
 *     title={<>Everything, <GradientText>timed to you</GradientText></>}
 *     subtitle="One app that adapts to your real schedule."
 *   >
 *     <div className="bento-grid">…</div>
 *   </SectionShell>
 *
 * Server-safe (the header uses the Reveal client boundary internally).
 */
export interface SectionShellProps {
  id?: string;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  /** Extra classes on the outer <section> (e.g. background helpers). */
  className?: string;
  /** Classes on the inner .container-x wrapper. */
  containerClassName?: string;
  /** Classes on the header block. */
  headerClassName?: string;
  /** Render prop escape hatch: content that should sit OUTSIDE the container
   *  (e.g. an absolutely-positioned .glow / .grid-bg). */
  decoration?: React.ReactNode;
  children?: React.ReactNode;
  'aria-labelledby'?: string;
}

export function SectionShell({
  id,
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className,
  containerClassName,
  headerClassName,
  decoration,
  children,
  ...rest
}: SectionShellProps) {
  const hasHeader = Boolean(eyebrow || title || subtitle);
  const titleId = id ? `${id}-title` : undefined;
  const centered = align === 'center';

  return (
    <section
      id={id}
      className={cn('section', className)}
      aria-labelledby={titleId}
      {...rest}
    >
      {decoration}
      <div className={cn('container-x', containerClassName)}>
        {hasHeader && (
          <Reveal
            className={cn(
              'flex flex-col gap-4',
              centered ? 'items-center text-center mx-auto max-w-2xl' : 'items-start text-left max-w-2xl',
              'mb-12 md:mb-16',
              headerClassName,
            )}
          >
            {eyebrow && <Badge variant="lime">{eyebrow}</Badge>}
            {title && (
              <h2
                id={titleId}
                className="text-4xl md:text-[2.9rem] lg:text-[3.4rem] font-bold leading-[1.06] tracking-[-0.02em]"
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-lg md:text-xl text-[var(--color-muted-foreground)] leading-relaxed">
                {subtitle}
              </p>
            )}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}
