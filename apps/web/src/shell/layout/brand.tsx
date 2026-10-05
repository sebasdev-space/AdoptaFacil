import { Link } from 'react-router-dom';
import { Logo } from '@adoptafacil/ui';

export interface BrandProps {
  className?: string;
  /** Use on a dark surface (the navy sidebar) — swaps the wordmark to a
   * light/teal pair that stays readable instead of the default navy text,
   * which would disappear against a navy background. */
  inverse?: boolean;
  /** Si se indica, el logo es un enlace al INICIO del lugar donde vive: `/inicio`
   * dentro del sistema (sesión iniciada) y `/` en las pantallas públicas. */
  to?: string;
}

/** AdoptaFácil brand mark used in the sidebar and mobile header — the real
 * logo asset (see `Logo`), never a text initial. Con `to`, siempre redirige
 * al inicio del lugar donde se muestra (requisito: el logo nunca es decorativo). */
export function Brand({ className, inverse = false, to }: BrandProps) {
  const logo = (
    <Logo variant="mark" tone={inverse ? 'dark' : 'light'} size="sm" className={className} />
  );
  if (!to) return logo;
  return (
    <Link to={to} aria-label="Ir al inicio" className="inline-flex">
      {logo}
    </Link>
  );
}
