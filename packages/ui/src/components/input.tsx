import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './input.module.scss';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Text input — hairline border, teal focus ring (REFACTOR-VISUAL v2, BEM+SCSS).
 * Inherits native validation/aria; `aria-invalid` switches the border/ring to
 * the destructive token for error states.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(styles.input, className)} {...props} />
  ),
);
Input.displayName = 'Input';
