import { useEffect, useState } from 'react';
import {
  DocumentStatus,
  DocumentType,
  Role,
  type OrganizationDocument,
  type UploadOrganizationDocumentResult,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { TextField } from '../components/profile-fields';

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.ExistenceRepresentationCertificate]: 'Certificado de existencia y representación',
  [DocumentType.Rut]: 'RUT',
  [DocumentType.LegalRepresentativeId]: 'Documento del representante legal',
  [DocumentType.Other]: 'Otro',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.Pending]: 'Pendiente',
  [DocumentStatus.UnderReview]: 'En revisión',
  [DocumentStatus.Observed]: 'Observado',
  [DocumentStatus.Approved]: 'Aprobado',
  [DocumentStatus.Rejected]: 'Rechazado',
  [DocumentStatus.Expired]: 'Vencido',
};

function statusVariant(status: DocumentStatus): 'default' | 'secondary' | 'destructive' {
  if (status === DocumentStatus.Approved) return 'default';
  if (status === DocumentStatus.Rejected || status === DocumentStatus.Expired) return 'destructive';
  return 'secondary';
}

/** Formatea un instante UTC en hora de Colombia para la UI. */
function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

/** `/organizacion/documentos` — gestión documental (RF03). Owner/Administrator
 *  suben/renuevan; Owner/Administrator/ReadOnlyAuditor consultan. El vencimiento
 *  se refleja en el estado (Vencido) y en el nivel de verificación. */
export function OrgDocumentsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [verification, setVerification] = useState<VerificationLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<DocumentType>(DocumentType.Rut);
  const [filename, setFilename] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    const [docs, level] = await Promise.all([
      client.request<OrganizationDocument[]>('/org/documents'),
      client.request<VerificationLevel>('/org/documents/verification'),
    ]);
    setDocuments(docs);
    setVerification(level);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [docs, level] = await Promise.all([
          client.request<OrganizationDocument[]>('/org/documents'),
          client.request<VerificationLevel>('/org/documents/verification'),
        ]);
        if (active) {
          setDocuments(docs);
          setVerification(level);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const submit = async (): Promise<void> => {
    if (!filename.trim()) {
      toast({
        title: 'Archivo requerido',
        description: 'Indica el nombre del archivo.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      await client.request<UploadOrganizationDocumentResult>('/org/documents', {
        method: 'POST',
        json: {
          type,
          filename: filename.trim(),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        },
      });
      setFilename('');
      setExpiresAt('');
      await load();
      toast({ title: 'Documento subido', description: 'Nueva versión enviada a revisión.' });
    } catch (error) {
      toast({
        title: 'No se pudo subir el documento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Documentos"
        description="Gestión documental con versionamiento y niveles de verificación (RF03)."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {verification && (
            <Card>
              <CardHeader>
                <CardTitle>Nivel de verificación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge>{verification.label ?? `Nivel ${verification.level}`}</Badge>
                {verification.blockedBy && verification.blockedBy.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Para el nivel {verification.nextLevel} faltan (o están vencidos):{' '}
                    {verification.blockedBy
                      .map((t) => TYPE_LABELS[t as DocumentType] ?? t)
                      .join(', ')}
                    .
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Subir / renovar documento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="doc-type" className="block text-sm font-medium text-foreground">
                    Tipo de documento
                  </label>
                  <select
                    id="doc-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as DocumentType)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Object.values(DocumentType).map((value) => (
                      <option key={value} value={value}>
                        {TYPE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <TextField id="doc-file" label="Archivo" value={filename} onChange={setFilename} />
                <TextField
                  id="doc-expires"
                  label="Vence (opcional)"
                  type="date"
                  value={expiresAt}
                  onChange={setExpiresAt}
                />
                <Button disabled={saving} onClick={() => void submit()}>
                  Subir nueva versión
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Documentos</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
              ) : (
                <ul className="space-y-3">
                  {documents.map((doc) => (
                    <li key={doc.id} className="border-b pb-2 text-sm last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{TYPE_LABELS[doc.type] ?? doc.type}</span>
                        <span className="text-muted-foreground">v{doc.version}</span>
                        <Badge variant={statusVariant(doc.status)}>
                          {STATUS_LABELS[doc.status]}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        Vence: {formatCO(doc.expiresAt)}
                        {doc.reviewNote && ` · Observación: ${doc.reviewNote}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
