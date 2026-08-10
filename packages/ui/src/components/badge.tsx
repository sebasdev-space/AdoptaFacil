import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './badge.module.scss';

export type BadgeVariant =
  'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: 'status-pill--default',
  secondary: 'status-pill--secondary',
  outline: 'status-pill--outline',
  success: 'status-pill--success',
  warning: 'status-pill--warning',
  destructive: 'status-pill--destructive',
  info: 'status-pill--info',
};

/** Small status pill — light tint + dark saturated text (REFACTOR-VISUAL v2, BEM+SCSS). */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(styles['status-pill'], styles[VARIANT_CLASS[variant]], className)}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';
