import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MercadoPagoConnectStatusView } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';

/** RNF: hora Colombia SOLO en presentación (UI) — el backend guarda/audita en
 *  UTC, esta es la única conversión, igual convención que
 *  `org-formalization-page.tsx`/`org-documents-page.tsx`. */
function formatConnectedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

/**
 * "Conectar Mercado Pago" (Split de Pagos 1:1, T-OAuth-Connect) — lets an
 * Owner/Administrator connect the org's OWN MercadoPago account via OAuth so
 * money splits automatically at checkout later (that wiring is a separate
 * follow-up; this section is ONLY connect/status/disconnect). Same
 * `window.location.href` full-page-navigation pattern `donate-page.tsx` uses
 * for `paymentLinkUrl` — this leaves the SPA entirely and comes back via the
 * backend's `/org/mercadopago/callback` redirect to
 * `/organizacion?mercadopago=connected|error`.
 */
export function MercadoPagoConnectSection() {
  const client = useApiClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<MercadoPagoConnectStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(() => {
    setLoading(true);
    client
      .request<MercadoPagoConnectStatusView>('/org/mercadopago/status')
      .then((data) => setStatus(data))
      // Best-effort: an unreachable/unexpected response just shows the
      // connect button (never crashes the profile page over this section).
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Result of the OAuth round trip (`?mercadopago=connected|error`, set by
  // the backend's public callback redirect) — show a toast, refresh the
  // status, then strip the param so a page refresh doesn't re-show the toast.
  useEffect(() => {
    const result = searchParams.get('mercadopago');
    if (!result) return;

    if (result === 'connected') {
      toast({
        title: 'Cuenta de Mercado Pago conectada',
        description: 'Tu organización ya puede recibir pagos divididos automáticamente.',
      });
      refreshStatus();
    } else if (result === 'error') {
      toast({
        title: 'No se pudo conectar Mercado Pago',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('mercadopago');
    setSearchParams(next, { replace: true });
    // Deliberately run once per mount for the `?mercadopago=` param this page
    // was just redirected back with — `searchParams`/`refreshStatus`/
    // `setSearchParams` identity churn must not re-trigger the toast.
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { authorizeUrl } = await client.request<{ authorizeUrl: string }>(
        '/org/mercadopago/connect',
      );
      // Full-page navigation — leaves the SPA for MercadoPago's own
      // authorization screen, same as a donation's `paymentLinkUrl`.
      window.location.href = authorizeUrl;
    } catch {
      toast({
        title: 'No se pudo iniciar la conexión',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await client.request('/org/mercadopago/connect', { method: 'DELETE' });
      setConfirmingDisconnect(false);
      toast({ title: 'Mercado Pago desconectado' });
      refreshStatus();
    } catch {
      toast({
        title: 'No se pudo desconectar',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mercado Pago</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Consultando el estado de la conexión…</p>
        ) : status?.connected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Cuenta conectada</Badge>
              {status.mpUserId && (
                <span className="text-sm text-muted-foreground">
                  ID Mercado Pago: {status.mpUserId}
                </span>
              )}
            </div>
            {status.connectedAt && (
              <p className="text-xs text-muted-foreground">
                Conectada el {formatConnectedAt(status.connectedAt)}
              </p>
            )}
            {confirmingDisconnect ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground">
                  ¿Seguro que quieres desconectar la cuenta de Mercado Pago de tu organización?
                </p>
                <Button
                  size="sm"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={disconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? 'Desconectando…' : 'Sí, desconectar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={disconnecting}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div>
                <Button variant="outline" size="sm" onClick={() => setConfirmingDisconnect(true)}>
                  Desconectar
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecta la cuenta de Mercado Pago de tu organización para recibir tus pagos
              directamente.
            </p>
            <div>
              <Button onClick={connect} disabled={connecting}>
                {connecting ? 'Redirigiendo…' : 'Conectar Mercado Pago'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
