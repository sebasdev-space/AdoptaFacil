import { useEffect, useState } from 'react';
import { Role, type PlatformAdminDashboardSummary } from '@adoptafacil/contracts';
import { Card, CardContent, EmptyState, Skeleton, StatCard } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

/**
 * `/plataforma/dashboard` (RF24, M13, S-8) — consolida en un solo lugar los
 * TRES conteos de pendientes que hoy solo se ven entrando a cada cola por
 * separado (documentos, organizaciones duplicadas, reseñas). Cada tarjeta
 * enlaza a su cola real para actuar sobre ella — este dashboard es de
 * lectura, la acción sigue viviendo en cada cola.
 */
export function PlatformAdminDashboardPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canView = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);

  const [summary, setSummary] = useState<PlatformAdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await client.request<PlatformAdminDashboardSummary>(
          '/platform/dashboard/admin',
        );
        if (active) setSummary(data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Dashboard de plataforma" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard de plataforma"
        description="Conteos pendientes de las tres colas de revisión."
      />
      {loading && <Skeleton className="h-32 w-full" />}
      {!loading && summary && (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
            <StatCard label="Documentos pendientes" value={summary.pendingDocuments} />
            <StatCard label="Organizaciones duplicadas" value={summary.pendingDuplicateFlags} />
            <StatCard label="Reseñas por moderar" value={summary.pendingReviews} />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
