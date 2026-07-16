import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Loading placeholder. Decorative by default (`aria-hidden`); pass an
 * `aria-label` and `role="status"` if it should announce a loading region.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn('animate-pulse-soft rounded-md bg-muted', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
