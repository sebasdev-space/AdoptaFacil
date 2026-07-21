import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@adoptafacil/ui';
import type { PortalSection } from '@adoptafacil/contracts';

export interface PortalPlaceholderSectionProps {
  section: PortalSection;
}

/**
 * Sección AGREGADA del portal en estado placeholder. Renderiza el título de la
 * sección y un empty state describiendo qué mostrará. El `integrationPoint` del
 * contrato queda como comentario/`data-*` para el módulo que la cablee; esta
 * sección no consume ni expone datos de negocio todavía (sin fuga entre orgs).
 */
export function PortalPlaceholderSection({ section }: PortalPlaceholderSectionProps) {
  const headingId = `portal-section-${section.kind}`;

  return (
    <section aria-labelledby={headingId} data-integration-point={section.integrationPoint}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId}>{section.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* TODO(M14): cablear esta sección a su módulo dueño (ver integrationPoint). */}
          <EmptyState title="Próximamente" description={section.description} />
        </CardContent>
      </Card>
    </section>
  );
}
