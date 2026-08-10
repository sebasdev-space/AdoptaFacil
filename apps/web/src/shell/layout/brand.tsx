import { Logo } from '@adoptafacil/ui';

export interface BrandProps {
  className?: string;
  /** Use on a dark surface (the navy sidebar) — swaps the wordmark to a
   * light/teal pair that stays readable instead of the default navy text,
   * which would disappear against a navy background. */
  inverse?: boolean;
}

/** AdoptaFácil brand mark used in the sidebar and mobile header — the real
 * logo asset (see `Logo`), never a text initial. */
export function Brand({ className, inverse = false }: BrandProps) {
  return <Logo variant="mark" tone={inverse ? 'dark' : 'light'} size="sm" className={className} />;
}
