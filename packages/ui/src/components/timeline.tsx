import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './timeline.module.scss';

export interface TimelineEvent {
  key: string;
  label: React.ReactNode;
  /** e.g. "28 jun 2026 · Dra. Salas". */
  meta?: React.ReactNode;
  /** Highlights the dot (e.g. the most recent / unresolved event). */
  active?: boolean;
}

export interface TimelineProps extends React.HTMLAttributes<HTMLUListElement> {
  events: TimelineEvent[];
}

/** Chronological event list (actividad reciente, expediente clínico, …) — BEM+SCSS. */
export const Timeline = React.forwardRef<HTMLUListElement, TimelineProps>(
  ({ className, events, ...props }, ref) => (
    <ul ref={ref} className={cn(styles.timeline, className)} {...props}>
      {events.map((event) => (
        <li key={event.key} className={styles.timeline__item}>
          <span
            aria-hidden
            className={cn(styles.timeline__dot, event.active && styles['timeline__dot--active'])}
          />
          <div className={styles.timeline__content}>
            <p className={styles.timeline__label}>{event.label}</p>
            {event.meta && <p className={styles.timeline__meta}>{event.meta}</p>}
          </div>
        </li>
      ))}
    </ul>
  ),
);
Timeline.displayName = 'Timeline';
