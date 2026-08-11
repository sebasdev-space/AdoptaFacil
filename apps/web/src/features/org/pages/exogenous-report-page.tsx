import { ComingSoon } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';

/**
 * `/organizacion/reporte-exogeno` (Fase 12, REFACTOR-VISUAL v2) — módulo aún
 * no construido: no existe un endpoint que genere el archivo de información
 * exógena (Reporte 2575) a partir de los certificados de donación emitidos.
 * El mockup de referencia (ReporteExogeno.png) muestra un checklist de
 * requisitos y un generador de archivo DIAN — nada de eso se simula aquí
 * (`ComingSoon`).
 */
export function ExogenousReportPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Reporte exógeno 2575"
        description="Consolidación de certificados de donación para tu reporte tributario."
      />
      <ComingSoon
        icon={<span aria-hidden>🧾</span>}
        title="Disponible próximamente"
        description="Aquí podrás generar el archivo con el formato exigido por la DIAN a partir de tus certificados de donación emitidos."
      />
    </PageContainer>
  );
}
