import { Badge, Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { formatBogota, formatCop, type MockCertificate } from '../model/mock-certificate';
import { CertificateQr } from './certificate-qr';

export interface CertificateDocumentProps {
  certificate: MockCertificate;
}

/**
 * Plantilla VISUAL del certificado de donación (§M05/RF14, maqueta T-053). Muestra
 * el emisor —una ESAL con RTE vigente, fiel al gating conceptual del RF14—, los datos
 * de la donación, el CÓDIGO ÚNICO verificable, el HASH de muestra y el QR de muestra.
 * Todo es de EJEMPLO (ver mock-certificate). No implementa generación ni gating real.
 */
export function CertificateDocument({ certificate }: CertificateDocumentProps) {
  return (
    <Card data-testid="certificate-document">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Certificado de donación</CardTitle>
          {/* Gating conceptual RF14: el certificado es SOLO para ESAL con RTE.
              F1-03-COMPLETO: el cruce reportado sobre el contraste de
              `variant="success"` (~4.10:1) ya fue resuelto por F-BADGE en
              `packages/ui/src/styles/globals.css` (~4.80:1, verificado de nuevo
              en REFACTOR-VISUAL Fase A) — nada que hacer aquí. */}
          <Badge variant="success">ESAL · RTE vigente</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {certificate.organizationName}
          {certificate.organizationNit && ` · NIT ${certificate.organizationNit}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Donante</dt>
            <dd className="text-sm font-medium">{certificate.donorName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Monto</dt>
            <dd className="text-sm font-medium">{formatCop(certificate.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Fecha de emisión</dt>
            <dd className="text-sm">{formatBogota(certificate.issuedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Código único</dt>
            <dd className="font-mono text-sm" data-testid="certificate-code">
              {certificate.code}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Hash del documento (muestra)</p>
            <p className="max-w-md break-all font-mono text-xs text-muted-foreground">
              {certificate.contentHash}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <CertificateQr />
            <span className="text-xs text-muted-foreground">
              Escanéalo para visitar AdoptaFácil
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
