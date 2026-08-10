import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './button.module.scss';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'dark';
  size?: 'default' | 'sm' | 'lg';
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'button--primary',
  outline: 'button--outline',
  ghost: 'button--ghost',
  dark: 'button--dark',
};

const SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'button--md',
  sm: 'button--sm',
  lg: 'button--lg',
};

export interface ButtonVariantOptions {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}

/**
 * Class-string helper for non-`<button>` elements styled as a button (e.g. a
 * `<Link>`) — same call shape the old CVA `buttonVariants` had, so every
 * existing `buttonVariants({ variant, size })` call site keeps working
 * unchanged after the BEM+SCSS migration.
 */
export function buttonVariants({
  variant = 'default',
  size = 'default',
}: ButtonVariantOptions = {}): string {
  return cn(styles.button, styles[VARIANT_CLASS[variant]], styles[SIZE_CLASS[size]]);
}

/** Pill-shaped action button (REFACTOR-VISUAL v2, BEM+SCSS). */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
