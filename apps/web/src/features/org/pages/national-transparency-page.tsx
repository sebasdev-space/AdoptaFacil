import { ComingSoon } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';

/**
 * `/organizacion/transparencia-nacional` (Fase 12, REFACTOR-VISUAL v2) —
 * módulo aún no construido: no existe un endpoint público que consolide
 * movimientos (donaciones/gastos) cross-tenant a nivel nacional; el indicador
 * REAL de transparencia (Nivel/%/Rendición) de esta organización ya vive en
 * la barra superior del shell (`shell/transparency`), sin relación con este
 * "libro público" nacional. El mockup de referencia (LibroPublico.png)
 * muestra un explorador de movimientos con evidencia y hash verificable de
 * TODAS las organizaciones — nada de eso se simula aquí (`ComingSoon`).
 */
export function NationalTransparencyPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Transparencia nacional"
        description="El libro público del rescate animal en Colombia."
      />
      <ComingSoon
        icon={<span aria-hidden>📖</span>}
        title="Disponible próximamente"
        description="Aquí podrás explorar cada donación y gasto ejecutado por las organizaciones verificadas, con evidencia y trazabilidad."
      />
    </PageContainer>
  );
}
