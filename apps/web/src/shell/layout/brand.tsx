import { cn } from '@adoptafacil/ui';

export interface BrandProps {
  className?: string;
  /** Use on a dark surface (the navy sidebar) — swaps the wordmark to a
   * light/teal pair that stays readable instead of the default navy text,
   * which would disappear against a navy background. */
  inverse?: boolean;
}

/** AdoptaFácil wordmark used in the sidebar and mobile header. */
export function Brand({ className, inverse = false }: BrandProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        aria-hidden
      >
        <span className="text-base font-bold">A</span>
      </span>
      <span
        className={cn(
          'text-lg font-semibold tracking-tight',
          inverse ? 'text-white' : 'text-foreground',
        )}
      >
        Adopta<span className={inverse ? 'text-brand-teal' : 'text-primary'}>Fácil</span>
      </span>
    </div>
  );
}
