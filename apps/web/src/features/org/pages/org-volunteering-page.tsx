import { ComingSoon } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';

/**
 * `/organizacion/voluntariado` (Fase 12, REFACTOR-VISUAL v2) — módulo aún no
 * construido: no existe backend (endpoints, tablas) ni frontend previo para
 * voluntarios/horas de servicio social. El mockup de referencia
 * (Voluntariado.png/NuevoVoluntariado.png) muestra gestión de postulaciones,
 * validación de horas y certificados — nada de eso se simula aquí; la
 * pantalla es honesta sobre no estar disponible todavía (`ComingSoon`).
 */
export function OrgVolunteeringPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Voluntariado"
        description="Gestión de voluntarios y horas de servicio social."
      />
      <ComingSoon
        icon={<span aria-hidden>🙌</span>}
        title="Disponible próximamente"
        description="Aquí podrás publicar oportunidades de voluntariado, aprobar postulaciones y validar horas de servicio social."
      />
    </PageContainer>
  );
}
