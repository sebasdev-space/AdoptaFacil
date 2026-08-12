import { Link } from 'react-router-dom';
import { Badge, buttonVariants } from '@adoptafacil/ui';

/**
 * Aviso PERSISTENTE (nunca un toast que desaparece solo — se pidió
 * explícitamente que se quede visible) de que la organización no tiene
 * configurada su dirección pública (`organization_profiles.slug`, antes
 * mostrado como "Slug" en la UI — ver `org-profile-form.tsx`). Sin esa
 * dirección, ningún animal de la organización aparece en el catálogo
 * público (`public-animals.service.ts`: una org sin slug queda excluida del
 * catálogo global, y es inalcanzable por URL en su propio portal) — un
 * problema real detectado sin ningún aviso previo en la UI.
 *
 * Mismo patrón visual que `DesignPreviewBanner`
 * (features/certificates/components/design-preview-banner.tsx): `Badge` +
 * caja con borde punteado, sin temporizador de ningún tipo.
 */
export function MissingSlugBanner() {
  return (
    <div
      data-testid="missing-slug-banner"
      role="note"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-warning-foreground/70 bg-warning/10 px-3 py-2 text-sm text-foreground"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="warning">Portal no configurado</Badge>
        <span>
          Tu organización aún no tiene una <strong>dirección pública</strong> configurada. Los
          animales de tu catálogo no se mostrarán en el catálogo público hasta que la agregues. Ve a{' '}
          <strong>Mi organización → Datos institucionales</strong> para configurarla.
        </span>
      </div>
      <Link to="/organizacion" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Ir a Mi organización
      </Link>
    </div>
  );
}
