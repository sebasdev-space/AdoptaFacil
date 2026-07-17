import { useCallback, useEffect, useState } from 'react';
import type { HealthStatus } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@adoptafacil/ui';
import { fetchHealth } from '../../../lib/api';
import { PageContainer, PageHeader } from '../page';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: HealthStatus }
  | { status: 'error'; message: string };

function StatusRow({ label, value, up }: { label: string; value: string; up: boolean }) {
  return (
    <li className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={up ? 'success' : 'destructive'}>{value}</Badge>
    </li>
  );
}

/**
 * Portal home. Keeps the walking-skeleton system-health check (browser → API →
 * Postgres/Redis) as the landing content while the real dashboard arrives in
 * Ola 1.
 */
export function HomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    fetchHealth()
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Error desconocido',
        }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title="Inicio"
        description="Portal AdoptaFácil — navegación, transparencia y estado del sistema."
      />

      <Card className="max-w-xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>Estado del sistema</CardTitle>
            <CardDescription>Conectividad del backend (API · Postgres · Redis).</CardDescription>
          </div>
          <Button size="sm" onClick={load} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Cargando…' : 'Refrescar'}
          </Button>
        </CardHeader>
        <CardContent>
          {state.status === 'loading' && (
            <p className="text-sm text-muted-foreground">Consultando /health…</p>
          )}

          {state.status === 'error' && (
            <p className="text-sm text-destructive">No se pudo contactar la API: {state.message}</p>
          )}

          {state.status === 'ready' && (
            <ul className="divide-y">
              <StatusRow label="status" value={state.data.status} up={state.data.status === 'ok'} />
              <StatusRow label="db" value={state.data.db} up={state.data.db === 'up'} />
              <StatusRow label="redis" value={state.data.redis} up={state.data.redis === 'up'} />
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
