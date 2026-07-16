import * as React from 'react';
import { cn } from '../lib/utils';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional decorative icon/illustration shown above the title. */
  icon?: React.ReactNode;
  /** Short headline describing the empty condition. */
  title: React.ReactNode;
  /** Supporting text explaining what to do next. */
  description?: React.ReactNode;
  /** Primary call to action (e.g. a Button). */
  action?: React.ReactNode;
}

/**
 * Placeholder for "no data yet" regions. Announced as a status region so
 * assistive tech reads it when it replaces a list/table. Icon is decorative.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div aria-hidden className="text-muted-foreground [&_svg]:h-10 [&_svg]:w-10">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
