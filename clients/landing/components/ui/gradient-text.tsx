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
  // Cast to a plain component type: rendering a bare `React.ElementType`
  // widens `children` to the union of every JSX element (including the r3f
  // three.js intrinsics), which collapses the children prop to `never`.
  const Component = Tag as React.ComponentType<
    React.HTMLAttributes<HTMLElement>
  >;
  return (
    <Component className={cn('gradient-text', className)} {...props}>
      {children}
    </Component>
  );
}
