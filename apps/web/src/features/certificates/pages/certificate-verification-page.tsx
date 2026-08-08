import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
} from '@adoptafacil/ui';
import { DesignPreviewBanner } from '../components/design-preview-banner';
import {
  CERTIFICATE_NEUTRAL_FALLBACK,
  formatBogota,
  formatCop,
  MOCK_CERTIFICATE,
  type MockCertificate,
} from '../model/mock-certificate';

type VerifyState = 'idle' | 'valid' | 'invalid';

/** El certificado real viaja desde la emisión (F-CERT-REAL) por nav-state. */
interface VerifyNavState {
  certificate?: MockCertificate;
}

/**
 * Paso 4-5 del flujo de confianza (§M05/RF14, maqueta T-053 → F-CERT-REAL):
 * VERIFICACIÓN PÚBLICA. Página SIN sesión (como el portal público de T-052): se
 * ingresa un código y, si es el de muestra, se muestra "certificado válido" + la
 * EVIDENCIA de autenticidad (emisor ESAL-RTE, fecha, hash de muestra) — el sello
 * que pidió el cliente.
 *
 * CERO backend: NO valida contra el servidor; compara contra el código de EJEMPLO de
 * forma determinista. En el RF14 real, esto consultará un endpoint público de
 * verificación (patrón SECURITY DEFINER, como el portal/animales público).
 *
 * F-CERT-REAL: cuando se llega desde "Verificar este certificado" (misma sesión,
 * `CertificateEmissionPage`), el certificado REAL viaja por nav-state y esta
 * pantalla muestra EXACTAMENTE los mismos datos — ya no un segundo set de muestra
 * incoherente. Sin ese estado (código tecleado a mano, o un deep-link/QR abierto
 * SIN pasar por la emisión en esta sesión) no hay forma de reconstruir la donación
 * real sin backend (RF14, post-pitch): se usa el mismo fallback NEUTRO que la
 * emisión usa en ese mismo caso — nunca la entidad ficticia de muestra.
 */
export function CertificateVerificationPage() {
  const { code: codeParam } = useParams<{ code: string }>();
  const location = useLocation();
  const passedCertificate = (location.state as VerifyNavState | null)?.certificate;
  const [code, setCode] = useState(codeParam ?? '');
  const [state, setState] = useState<VerifyState>('idle');

  const verify = (value: string) => {
    setState(value.trim() === MOCK_CERTIFICATE.code ? 'valid' : 'invalid');
  };

  // Deep-link con :code → verifica automáticamente (el QR/enlace de la maqueta).
  useEffect(() => {
    if (codeParam) verify(codeParam);
  }, [codeParam]);

  // Certificado real de la MISMA sesión (nav-state) si llegó por ese código; si no,
  // el fallback NEUTRO — nunca la entidad ficticia de muestra ("María Restrepo" /
  // "Fundación Huellas de Esperanza"), consistente con el fallback de la emisión.
  const shownCertificate: MockCertificate =
    passedCertificate && passedCertificate.code === MOCK_CERTIFICATE.code
      ? passedCertificate
      : {
          ...MOCK_CERTIFICATE,
          organizationName: CERTIFICATE_NEUTRAL_FALLBACK.organizationName,
          organizationNit: undefined,
          donorName: CERTIFICATE_NEUTRAL_FALLBACK.donorName,
        };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="space-y-6">
        <DesignPreviewBanner detail="Así se verificará públicamente un certificado:" />

        <Card>
          <CardHeader>
            <CardTitle>Verificar un certificado de donación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ingresa el código único del certificado para comprobar su autenticidad.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Código del certificado"
                placeholder="ADF-CERT-2026-000742"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button onClick={() => verify(code)}>Verificar</Button>
            </div>
          </CardContent>
        </Card>

        {state === 'valid' && (
          <Card data-testid="verification-result" className="border-success/50 bg-success/5">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Certificado válido</CardTitle>
                <Badge variant="success">Auténtico</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Evidencia de autenticidad emitida por una ESAL con RTE vigente.
              </p>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2" data-testid="authenticity-evidence">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Emisor</dt>
                  <dd className="text-sm font-medium">
                    {shownCertificate.organizationName}
                    {shownCertificate.organizationNit &&
                      ` · NIT ${shownCertificate.organizationNit}`}
                    <span className="ml-2 align-middle">
                      <Badge variant="success">ESAL · RTE</Badge>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Donante</dt>
                  <dd className="text-sm font-medium">{shownCertificate.donorName}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Monto</dt>
                  <dd className="text-sm">{formatCop(shownCertificate.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Fecha de emisión</dt>
                  <dd className="text-sm">{formatBogota(shownCertificate.issuedAt)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-muted-foreground">Hash del documento</dt>
                  <dd className="break-all font-mono text-xs text-muted-foreground">
                    {shownCertificate.contentHash}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}

        {state === 'invalid' && (
          <EmptyState
            title="Código no encontrado"
            description="No pudimos verificar ese código. Revisa que esté completo e inténtalo de nuevo."
          />
        )}
      </div>
    </main>
  );
}
