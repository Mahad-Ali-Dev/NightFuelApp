import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * GradientText — wraps inline text in the lime→cyan clip gradient (`.gradient-text`).
 * Use inside headings for the emphasized phrase. Server-safe.
 *
 *   <h2>Nutrition that runs on <GradientText>your clock</GradientText></h2>
 */
export function GradientText({
  as: Tag = 'span',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
}) {
  const Component = Tag;
  return (
    <Component className={cn('gradient-text', className)} {...props}>
      {children}
    </Component>
  );
}
