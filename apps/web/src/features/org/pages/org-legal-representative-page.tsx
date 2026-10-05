import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Role,
  type LegalRepresentative,
  type LegalRepresentativeDocumentType,
  type LegalRepresentativeRole,
  type RegisterLegalRepresentativeInput,
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
import { SignaturePad } from '../components/signature-pad';

/**
 * TODO(client): catálogo no fijado por el documento base — mismo set mínimo
 * extensible que el backend (legal-representative.schemas.ts).
 */
const DOCUMENT_TYPE_OPTIONS: { value: LegalRepresentativeDocumentType; label: string }[] = [
  { value: 'cedula_ciudadania', label: 'Cédula de ciudadanía' },
  { value: 'cedula_extranjeria', label: 'Cédula de extranjería' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

/**
 * Requerimiento #16: un rol por firmante que la organización puede mantener
 * VIGENTE al mismo tiempo (registrar uno no reemplaza a los otros). TODO(client):
 * catálogo no fijado por el documento base — mismo patrón extensible que
 * `DOCUMENT_TYPE_OPTIONS`.
 */
const ROLE_OPTIONS: { value: LegalRepresentativeRole; label: string }[] = [
  { value: 'legal_representative', label: 'Representante legal' },
  { value: 'accountant', label: 'Contador' },
  { value: 'fiscal_reviewer', label: 'Revisor fiscal' },
];

const ROLE_LABELS = Object.fromEntries(
  ROLE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<LegalRepresentativeRole, string>;

function formatCO(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

/** Lee un `File` como base64 (sin el prefijo `data:...;base64,`). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

/** Una tarjeta por rol (requerimiento #16): muestra el registro vigente de ESE
 *  rol, o un estado "sin registrar" — nunca mezcla ni reemplaza los demás. */
function RepresentativeSlot({
  role,
  rep,
}: {
  role: LegalRepresentativeRole;
  rep: LegalRepresentative | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ROLE_LABELS[role]}
        </p>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {rep ? rep.fullName : 'Sin registrar'}
          {rep && <Badge variant="success">Vigente</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {rep ? (
          <>
            <p>{rep.position}</p>
            <p>Firmado el {formatCO(rep.signedAt)}</p>
          </>
        ) : (
          <p>Aún no se ha registrado un {ROLE_LABELS[role].toLowerCase()}.</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * `/organizacion/representante-legal` (M01, S-1, RF14 relacionado / RNF10).
 * Cualquier miembro con acceso a esta ruta ve los firmantes vigentes; solo el
 * Owner puede registrar uno nuevo (el backend es la autoridad real — este
 * gate de UI solo evita mostrar un formulario que de todos modos rechazaría).
 *
 * Requerimiento #16: la organización puede mantener un representante legal,
 * un contador y un revisor fiscal vigentes AL MISMO TIEMPO — registrar uno de
 * estos roles NUNCA reemplaza a los otros. Registrar de nuevo un mismo rol
 * tampoco edita el anterior — crea un registro nuevo (append-only) que pasa a
 * ser el vigente DE ESE ROL, que es exactamente lo que hace falta para
 * "cambio de representante/contador/revisor fiscal".
 */
export function OrgLegalRepresentativePage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const { toast } = useToast();
  const canRegister = hasRole(Role.Owner);

  const [current, setCurrent] = useState<LegalRepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [role, setRole] = useState<LegalRepresentativeRole>('legal_representative');
  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] =
    useState<LegalRepresentativeDocumentType>('cedula_ciudadania');
  const [documentNumber, setDocumentNumber] = useState('');
  const [position, setPosition] = useState('');
  const [captureMode, setCaptureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [signatureContentType, setSignatureContentType] = useState('image/png');
  const [saving, setSaving] = useState(false);

  const currentByRole = useMemo(() => {
    const map = new Map<LegalRepresentativeRole, LegalRepresentative>();
    for (const rep of current) map.set(rep.role, rep);
    return map;
  }, [current]);
  const selectedRoleCurrent = currentByRole.get(role);

  useEffect(() => {
    let active = true;
    client
      .request<LegalRepresentative[]>('/org/legal-representative')
      .then((data) => {
        if (active) setCurrent(data);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  async function handleFileSelected(file: File): Promise<void> {
    try {
      const base64 = await fileToBase64(file);
      setSignatureBase64(base64 || null);
      setSignatureContentType(file.type || 'application/octet-stream');
    } catch {
      toast({ title: 'No se pudo leer el archivo', variant: 'warning' });
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!fullName.trim() || !documentNumber.trim() || !position.trim()) {
      toast({
        title: 'Datos incompletos',
        description: 'Nombre completo, número de documento y cargo son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    if (!signatureBase64) {
      toast({
        title: 'Falta la firma',
        description: 'Dibuja tu firma o sube una imagen antes de guardar.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: RegisterLegalRepresentativeInput = {
        role,
        fullName: fullName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        position: position.trim(),
        signatureBase64,
        signatureContentType,
      };
      const created = await client.request<LegalRepresentative>('/org/legal-representative', {
        method: 'POST',
        json: body,
      });
      setCurrent((previous) => [...previous.filter((rep) => rep.role !== created.role), created]);
      setFullName('');
      setDocumentNumber('');
      setPosition('');
      setSignatureBase64(null);
      toast({
        title: `${ROLE_LABELS[created.role]} registrado`,
        description: 'Fabián lo usará para firmar los certificados de donación.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo registrar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Representante legal"
        description="Quién firma los certificados de donación de tu organización (RF14) y su firma electrónica."
      />
      <Link
        to="/organizacion"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a la organización
      </Link>

      {loading && <Skeleton className="h-48 w-full" />}
      {loadError && !loading && (
        <p className="text-sm text-destructive">No se pudo cargar el representante legal.</p>
      )}

      {!loading && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {ROLE_OPTIONS.map((option) => (
              <RepresentativeSlot
                key={option.value}
                role={option.value}
                rep={currentByRole.get(option.value)}
              />
            ))}
          </div>

          {canRegister && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedRoleCurrent
                    ? `Registrar un cambio de ${ROLE_LABELS[role].toLowerCase()}`
                    : `Registrar ${ROLE_LABELS[role].toLowerCase()}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      htmlFor="legalrep-role"
                      className="block text-sm font-medium text-foreground"
                    >
                      Tipo de firmante
                    </label>
                    <select
                      id="legalrep-role"
                      value={role}
                      onChange={(event) => setRole(event.target.value as LegalRepresentativeRole)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:max-w-xs"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField
                    id="legalrep-name"
                    label="Nombre completo"
                    value={fullName}
                    onChange={setFullName}
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="legalrep-doctype"
                      className="block text-sm font-medium text-foreground"
                    >
                      Tipo de documento
                    </label>
                    <select
                      id="legalrep-doctype"
                      value={documentType}
                      onChange={(event) =>
                        setDocumentType(event.target.value as LegalRepresentativeDocumentType)
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {DOCUMENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField
                    id="legalrep-docnumber"
                    label="Número de documento"
                    value={documentNumber}
                    onChange={setDocumentNumber}
                  />
                  <TextField
                    id="legalrep-position"
                    label="Cargo"
                    placeholder="Representante legal"
                    value={position}
                    onChange={setPosition}
                  />
                </div>

                <div className="space-y-2">
                  <span className="block text-sm font-medium text-foreground">Firma</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={captureMode === 'draw' ? 'default' : 'outline'}
                      onClick={() => {
                        setCaptureMode('draw');
                        setSignatureBase64(null);
                      }}
                    >
                      Dibujar firma
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={captureMode === 'upload' ? 'default' : 'outline'}
                      onClick={() => {
                        setCaptureMode('upload');
                        setSignatureBase64(null);
                      }}
                    >
                      Subir imagen
                    </Button>
                  </div>

                  {captureMode === 'draw' ? (
                    <SignaturePad
                      onChange={(base64) => {
                        setSignatureBase64(base64);
                        setSignatureContentType('image/png');
                      }}
                    />
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Subir imagen de la firma"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleFileSelected(file);
                      }}
                      className="block text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
                    />
                  )}
                  {signatureBase64 && (
                    <p className="text-xs font-medium text-emerald-600">✓ Firma lista</p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Tu firma se guarda cifrada. Nunca se muestra ni se comparte la imagen original —
                  solo se usa para firmar certificados.
                </p>

                <Button onClick={() => void handleSubmit()} disabled={saving}>
                  {saving ? 'Guardando…' : `Guardar ${ROLE_LABELS[role].toLowerCase()}`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
