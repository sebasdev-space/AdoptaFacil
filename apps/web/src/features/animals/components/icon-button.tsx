import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@adoptafacil/ui';
import { Tooltip } from './tooltip';
import styles from './icon-button.module.scss';

/**
 * Botón compacto de solo ícono con tooltip en hover — `packages/ui` no tiene
 * `IconButton` (confirmado por inventario); ver el comentario en `tooltip.tsx`
 * sobre por qué esto es feature-local. `label` sirve DOBLE propósito: nombre
 * accesible (`aria-label`) y texto del tooltip, para que nunca queden
 * desincronizados.
 */
export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'title' | 'aria-label'
> {
  icon: ReactNode;
  label: string;
  variant?: 'default' | 'danger';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, variant = 'default', className, type = 'button', ...rest }, ref) => (
    <Tooltip label={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          styles['icon-button'],
          variant === 'danger' && styles['icon-button--danger'],
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  ),
);
IconButton.displayName = 'IconButton';
