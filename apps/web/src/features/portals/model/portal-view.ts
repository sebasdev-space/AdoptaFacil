import type { OrganizationPublic, PortalSection, PortalView } from '@adoptafacil/contracts';

/**
 * Plantilla estática de las secciones AGREGADAS del portal rico. Cada entrada
 * declara su punto de integración; todas arrancan en `'placeholder'` hasta que su
 * módulo dueño exista y las cablee. Vive en la feature (NO en `@adoptafacil/contracts`)
 * porque es un VALOR en runtime y contracts se compila a CommonJS (deuda T-015).
 */
type SectionBlueprint = Pick<PortalSection, 'kind' | 'title' | 'description' | 'integrationPoint'>;

export const PORTAL_SECTION_BLUEPRINT: readonly SectionBlueprint[] = [
  {
    kind: 'pets',
    title: 'Mascotas en adopción',
    description: 'Esta organización todavía no ha publicado mascotas en adopción.',
    integrationPoint: 'M03 animales · GET /public/organizations/:slug/animals (pendiente)',
  },
  {
    kind: 'activeCampaign',
    title: 'Campaña activa',
    description: 'No hay una campaña de recaudación activa por ahora.',
    // F-CAMPANAS-PORTAL-2 (S2-07): cableada — igual que 'pets' arriba, este
    // título/descripción quedan sin usar una vez wireado (OrgPublicPage
    // renderiza `PortalCampaignsSection`, que trae su propio copy).
    integrationPoint: 'M06 campañas · GET /public/organizations/:slug/campaigns',
  },
  {
    kind: 'needsToday',
    title: 'Necesita hoy',
    description: 'No hay necesidades urgentes publicadas hoy.',
    integrationPoint: 'M-necesidades · GET /public/organizations/:slug/needs (pendiente)',
  },
  {
    kind: 'transparency',
    title: 'Transparencia',
    description: 'El libro público de esta organización aún no está disponible.',
    integrationPoint: 'M-transparencia · GET /public/organizations/:slug/ledger (pendiente)',
  },
];

/**
 * Ensambla el view-model del portal a partir de la proyección pública de la
 * organización. El perfil ENVUELVE `OrganizationPublic` (no copia sus campos), así
 * hereda por contrato cualquier cambio en los campos públicos de `org`. Las
 * secciones agregadas son estructurales (placeholders) hasta cablear sus módulos.
 */
export function buildPortalView(organization: OrganizationPublic): PortalView {
  // `organizationType` es parte del contrato público de `org` (enum canónico de
  // @sebastian, sujeto a la política `showOrganizationType`). El perfil lo hereda
  // por contrato; el badge respeta deny-by-default (ausente ⇒ no se pinta).
  const { organizationType } = organization;

  return {
    profile: { organization, organizationType },
    sections: PORTAL_SECTION_BLUEPRINT.map((section) => ({
      ...section,
      status: 'placeholder' as const,
    })),
  };
}
