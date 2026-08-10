import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';
import styles from './progress-stepper.module.scss';

export interface ProgressStep {
  key: string;
  label: React.ReactNode;
  /** e.g. "completado" / "en curso · 80%". */
  sublabel?: React.ReactNode;
}

export interface ProgressStepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: ProgressStep[];
  /** 0-based index of the active step — earlier steps render as done. */
  currentIndex: number;
}

/** Horizontal milestone stepper (formalización, onboarding, …) — BEM+SCSS. */
export const ProgressStepper = React.forwardRef<HTMLOListElement, ProgressStepperProps>(
  ({ className, steps, currentIndex, ...props }, ref) => (
    <ol ref={ref} className={cn(styles.stepper, className)} {...props}>
      {steps.map((step, index) => {
        const status =
          index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
        return (
          <li key={step.key} className={styles.stepper__step}>
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  styles.stepper__connector,
                  index <= currentIndex && styles['stepper__connector--done'],
                )}
              />
            )}
            <span
              className={cn(
                styles.stepper__dot,
                status === 'done' && styles['stepper__dot--done'],
                status === 'current' && styles['stepper__dot--current'],
              )}
              aria-hidden
            >
              {status === 'done' ? <Check /> : index + 1}
            </span>
            <span
              className={cn(
                styles.stepper__label,
                status === 'done' && styles['stepper__label--done'],
                status === 'current' && styles['stepper__label--current'],
              )}
            >
              {step.label}
            </span>
            {step.sublabel && <span className={styles.stepper__sublabel}>{step.sublabel}</span>}
          </li>
        );
      })}
    </ol>
  ),
);
ProgressStepper.displayName = 'ProgressStepper';
