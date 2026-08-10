import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './skeleton.module.scss';

/**
 * Loading placeholder block. Decorative by default (`aria-hidden`); pass an
 * `aria-label` and `role="status"` if it should announce a loading region.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} aria-hidden className={cn(styles['skeleton-block'], className)} {...props} />
  ),
);
Skeleton.displayName = 'Skeleton';
