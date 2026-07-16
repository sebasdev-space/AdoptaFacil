import { useCallback, useEffect, useState } from 'react';
import type { HealthStatus } from '@adoptafacil/contracts';
import { Button } from '@adoptafacil/ui';
import { fetchHealth } from './lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: HealthStatus }
  | { status: 'error'; message: string };

function Dot({ up }: { up: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: up ? 'hsl(142 72% 40%)' : 'hsl(0 72% 51%)' }}
    />
  );
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [dark, setDark] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    fetchHealth()
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation placeholder — the real shell/design system is Fabián's (Ola 0). */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-md bg-primary" aria-hidden />
          <span className="text-lg font-semibold">AdoptaFácil</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Inicio</span>
          <span>Adopciones</span>
          <span>Donaciones</span>
          <Button variant="outline" size="sm" onClick={() => setDark((value) => !value)}>
            {dark ? '☀️ Claro' : '🌙 Oscuro'}
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">Walking skeleton</h1>
        <p className="mt-2 text-muted-foreground">
          Shell vacío del monorepo. Estado en vivo del backend (browser → API → Postgres/Redis):
        </p>

        <section className="mt-8 rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Estado del sistema</h2>
            <Button size="sm" onClick={load} disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Cargando…' : 'Refrescar'}
            </Button>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            {state.status === 'loading' && (
              <p className="text-muted-foreground">Consultando /health…</p>
            )}

            {state.status === 'error' && (
              <p style={{ color: 'hsl(0 72% 51%)' }}>
                No se pudo contactar la API: {state.message}
              </p>
            )}

            {state.status === 'ready' && (
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Dot up={state.data.status === 'ok'} />
                  <span>status: {state.data.status}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Dot up={state.data.db === 'up'} />
                  <span>db: {state.data.db}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Dot up={state.data.redis === 'up'} />
                  <span>redis: {state.data.redis}</span>
                </li>
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
