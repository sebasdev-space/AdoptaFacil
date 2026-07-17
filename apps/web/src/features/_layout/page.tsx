import type { ReactNode } from 'react';
import { cn } from '@adoptafacil/ui';

/**
 * Shared page scaffolding for content rendered inside the shell. Module owners
 * (Ola 1) build their screens on top of these so spacing and headings stay
 * consistent across every portal section.
 */

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** Constrains and pads page content responsively within the content region. */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8', className)}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Optional actions rendered on the right (buttons, filters…). */
  actions?: ReactNode;
}

/** Standard page title block. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
