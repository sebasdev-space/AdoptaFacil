import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type Campaign,
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_EVIDENCE_TYPES,
  CampaignCategory,
  type CampaignEvidence,
  CampaignEvidenceType,
  type CampaignEvidenceUploadResult,
  CampaignStatus,
  type CreateCampaignEvidenceInput,
  type Paginated,
  Role,
  type UpdateCampaignEvidenceInput,
  type UpdateCampaignInput,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  buttonVariants,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/campaign-form-fields';
import { CampaignProgress } from '../components/campaign-progress';
import {
  CATEGORY_LABELS,
  EVIDENCE_TYPE_LABELS,
  STATUS_LABELS,
  campaignStatusVariant,
  formatBogota,
  formatCop,
} from '../model/campaigns-view';
import { EVIDENCE_ACCEPT, uploadEvidenceFile, validateEvidenceUpload } from '../lib/storage';

const CATEGORY_OPTIONS = CAMPAIGN_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));
const EVIDENCE_TYPE_OPTIONS = CAMPAIGN_EVIDENCE_TYPES.map((value) => ({
  value,
  label: EVIDENCE_TYPE_LABELS[value],
}));
const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as CampaignStatus[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

/** `YYYY-MM-DDTHH:mm:ssZ` → `YYYY-MM-DD` for a native date input. */
function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/organizacion/campanas/:id` (S2-01) — detalle interno de una campaña: editar
 * sus datos y gestionar sus evidencias de rendición (RF16). Editar campaña y
 * evidencias: Owner/Administrator/Operator; ver: + ReadOnlyAuditor.
 */
export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>('loading');
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CampaignCategory>(CampaignCategory.Medications);
  const [goalAmount, setGoalAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<CampaignStatus>(CampaignStatus.Active);
  const [saving, setSaving] = useState(false);

  const [evidences, setEvidences] = useState<CampaignEvidence[]>([]);
  const [evidencesLoading, setEvidencesLoading] = useState(true);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evType, setEvType] = useState<CampaignEvidenceType>(CampaignEvidenceType.Receipt);
  const [evConcept, setEvConcept] = useState('');
  const [evAmount, setEvAmount] = useState('');
  const [evSpentAt, setEvSpentAt] = useState('');
  const [evFile, setEvFile] = useState<File | null>(null);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [editingEvidenceId, setEditingEvidenceId] = useState<string | null>(null);

  const applyCampaign = (found: Campaign): void => {
    setCampaign(found);
    setTitle(found.title);
    setDescription(found.description ?? '');
    setCategory(found.category);
    setGoalAmount(String(found.goalAmount));
    setDeadline(toDateInputValue(found.deadline));
    setStatus(found.status);
  };

  // ⚠️ Blindaje anti-regresión (patrón de public-campaigns.ts): SIEMPRE se
  // normaliza `.items` a `[]` si la respuesta no trae un array.
  const loadEvidences = async (): Promise<void> => {
    if (!id) return;
    const page = await client.request<Partial<Paginated<CampaignEvidence>>>(
      `/campaigns/${encodeURIComponent(id)}/evidences?limit=50`,
    );
    setEvidences(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const found = await client.request<Campaign>(`/campaigns/${encodeURIComponent(id)}`);
        if (active) {
          applyCampaign(found);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    void (async () => {
      try {
        const page = await client.request<Partial<Paginated<CampaignEvidence>>>(
          `/campaigns/${encodeURIComponent(id)}/evidences?limit=50`,
        );
        if (active) setEvidences(Array.isArray(page?.items) ? page.items : []);
      } finally {
        if (active) setEvidencesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, id]);

  const submitCampaign = async (): Promise<void> => {
    if (!id) return;
    const goal = Number(goalAmount);
    if (!title.trim() || !deadline || !Number.isInteger(goal) || goal <= 0) {
      toast({
        title: 'Datos incompletos',
        description: 'Título, categoría, meta (entero COP > 0) y fecha límite son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: UpdateCampaignInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        goalAmount: goal,
        deadline: new Date(deadline).toISOString(),
        status,
      };
      const updated = await client.request<Campaign>(`/campaigns/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: body,
      });
      setCampaign(updated);
      toast({ title: 'Campaña actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la campaña',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetEvidenceForm = (): void => {
    setEvType(CampaignEvidenceType.Receipt);
    setEvConcept('');
    setEvAmount('');
    setEvSpentAt('');
    setEvFile(null);
  };

  const submitEvidence = async (): Promise<void> => {
    if (!id) return;
    if (!evConcept.trim() || !evSpentAt || !evFile) {
      toast({
        title: 'Datos incompletos',
        description: 'Concepto, fecha del gasto y archivo son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    const invalid = validateEvidenceUpload(evFile);
    if (invalid) {
      toast({ title: 'Archivo no válido', description: invalid, variant: 'warning' });
      return;
    }
    const amountValue = evAmount ? Number(evAmount) : undefined;
    if (amountValue !== undefined && (!Number.isInteger(amountValue) || amountValue <= 0)) {
      toast({
        title: 'Monto inválido',
        description: 'El monto (si lo indicas) debe ser un entero COP mayor a 0.',
        variant: 'warning',
      });
      return;
    }
    setSavingEvidence(true);
    try {
      const body: CreateCampaignEvidenceInput = {
        type: evType,
        concept: evConcept.trim(),
        ...(amountValue !== undefined ? { amount: amountValue } : {}),
        spentAt: new Date(evSpentAt).toISOString(),
        filename: evFile.name,
        contentType: evFile.type || undefined,
      };
      const result = await client.request<CampaignEvidenceUploadResult>(
        `/campaigns/${encodeURIComponent(id)}/evidences`,
        { method: 'POST', json: body },
      );
      await uploadEvidenceFile(client, result.upload.key, evFile);
      resetEvidenceForm();
      setShowEvidenceForm(false);
      await loadEvidences();
      toast({ title: 'Evidencia agregada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo agregar la evidencia',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSavingEvidence(false);
    }
  };

  const patchEvidence = async (
    evidenceId: string,
    patch: UpdateCampaignEvidenceInput,
  ): Promise<void> => {
    if (!id) return;
    try {
      await client.request(
        `/campaigns/${encodeURIComponent(id)}/evidences/${encodeURIComponent(evidenceId)}`,
        { method: 'PATCH', json: patch },
      );
      setEditingEvidenceId(null);
      await loadEvidences();
      toast({ title: 'Evidencia actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la evidencia',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const removeEvidence = async (evidenceId: string): Promise<void> => {
    if (!id) return;
    try {
      await client.request(
        `/campaigns/${encodeURIComponent(id)}/evidences/${encodeURIComponent(evidenceId)}`,
        { method: 'DELETE' },
      );
      await loadEvidences();
      toast({ title: 'Evidencia eliminada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo eliminar la evidencia',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Detalle de campaña"
        description="Edita la campaña y gestiona sus evidencias de rendición de cuentas."
      />
      <Link
        to="/organizacion/campanas"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a campañas
      </Link>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'not-found' && (
        <EmptyState
          title="Campaña no especificada"
          description="Falta el identificador de la campaña."
        />
      )}
      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}

      {state === 'ready' && campaign && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {campaign.title}
                <Badge variant="secondary">{CATEGORY_LABELS[campaign.category]}</Badge>
                <Badge variant={campaignStatusVariant(campaign.status)}>
                  {STATUS_LABELS[campaign.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CampaignProgress
                raisedAmount={campaign.raisedAmount}
                goalAmount={campaign.goalAmount}
                progress={campaign.progress}
              />
              <Link
                to={`/campanas/${encodeURIComponent(campaign.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Ver cómo se ve en público (incluye rendición de cuentas) →
              </Link>
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Editar campaña</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="campaign-edit-title"
                    className="block text-sm font-medium text-foreground"
                  >
                    Título
                  </label>
                  <Input
                    id="campaign-edit-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <TextAreaField
                  id="campaign-edit-description"
                  label="Descripción"
                  value={description}
                  onChange={setDescription}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id="campaign-edit-category"
                    label="Categoría"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORY_OPTIONS}
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="campaign-edit-goal"
                      className="block text-sm font-medium text-foreground"
                    >
                      Meta (COP)
                    </label>
                    <Input
                      id="campaign-edit-goal"
                      type="number"
                      min={1}
                      step={1}
                      value={goalAmount}
                      onChange={(e) => setGoalAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="campaign-edit-deadline"
                      className="block text-sm font-medium text-foreground"
                    >
                      Fecha límite
                    </label>
                    <Input
                      id="campaign-edit-deadline"
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </div>
                  <SelectField
                    id="campaign-edit-status"
                    label="Estado"
                    value={status}
                    onChange={setStatus}
                    options={STATUS_OPTIONS}
                  />
                </div>
                <Button disabled={saving} onClick={() => void submitCampaign()}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Evidencias de rendición</CardTitle>
              {canManage && (
                <Button size="sm" onClick={() => setShowEvidenceForm((v) => !v)}>
                  {showEvidenceForm ? 'Cancelar' : 'Agregar evidencia'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage && showEvidenceForm && (
                <div className="space-y-3 rounded-md border p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      id="evidence-type"
                      label="Tipo"
                      value={evType}
                      onChange={setEvType}
                      options={EVIDENCE_TYPE_OPTIONS}
                    />
                    <div className="space-y-1.5">
                      <label
                        htmlFor="evidence-amount"
                        className="block text-sm font-medium text-foreground"
                      >
                        Monto (COP, opcional)
                      </label>
                      <Input
                        id="evidence-amount"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Déjalo vacío si no aplica"
                        value={evAmount}
                        onChange={(e) => setEvAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="evidence-concept"
                      className="block text-sm font-medium text-foreground"
                    >
                      Concepto
                    </label>
                    <Input
                      id="evidence-concept"
                      placeholder="p. ej. Compra de insumos quirúrgicos"
                      value={evConcept}
                      onChange={(e) => setEvConcept(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="evidence-spent-at"
                        className="block text-sm font-medium text-foreground"
                      >
                        Fecha del gasto
                      </label>
                      <Input
                        id="evidence-spent-at"
                        type="date"
                        value={evSpentAt}
                        onChange={(e) => setEvSpentAt(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="evidence-file"
                        className="block text-sm font-medium text-foreground"
                      >
                        Archivo (imagen o PDF, máx. 15 MB)
                      </label>
                      <input
                        id="evidence-file"
                        type="file"
                        accept={EVIDENCE_ACCEPT.join(',')}
                        onChange={(e) => setEvFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
                      />
                    </div>
                  </div>
                  <Button disabled={savingEvidence} onClick={() => void submitEvidence()}>
                    {savingEvidence ? 'Subiendo…' : 'Agregar evidencia'}
                  </Button>
                </div>
              )}

              {evidencesLoading && <Skeleton className="h-32 w-full" />}
              {!evidencesLoading && evidences.length === 0 && (
                <p className="text-sm text-muted-foreground">Aún no hay evidencias registradas.</p>
              )}
              {!evidencesLoading && evidences.length > 0 && (
                <ul className="space-y-3">
                  {evidences.map((evidence) =>
                    editingEvidenceId === evidence.id ? (
                      <EvidenceEditRow
                        key={evidence.id}
                        evidence={evidence}
                        onCancel={() => setEditingEvidenceId(null)}
                        onSave={(patch) => patchEvidence(evidence.id, patch)}
                      />
                    ) : (
                      <li
                        key={evidence.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            <Badge variant="secondary">{EVIDENCE_TYPE_LABELS[evidence.type]}</Badge>
                            <span className="truncate">{evidence.concept}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBogota(evidence.spentAt)}
                            {typeof evidence.amount === 'number' &&
                              ` · ${formatCop(evidence.amount)}`}
                          </p>
                        </div>
                        {canManage && (
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingEvidenceId(evidence.id)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void removeEvidence(evidence.id)}
                            >
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

interface EvidenceEditRowProps {
  evidence: CampaignEvidence;
  onCancel: () => void;
  onSave: (patch: UpdateCampaignEvidenceInput) => void;
}

/** Inline edit row for a single evidence's business fields (the file is immutable). */
function EvidenceEditRow({ evidence, onCancel, onSave }: EvidenceEditRowProps) {
  const [concept, setConcept] = useState(evidence.concept);
  const [amount, setAmount] = useState(evidence.amount ? String(evidence.amount) : '');
  const [spentAt, setSpentAt] = useState(toDateInputValue(evidence.spentAt));

  const save = (): void => {
    const amountValue = amount ? Number(amount) : undefined;
    onSave({
      concept: concept.trim() || undefined,
      amount: amountValue,
      spentAt: spentAt ? new Date(spentAt).toISOString() : undefined,
    });
  };

  return (
    <li className="space-y-3 rounded-md border p-3">
      <Input value={concept} onChange={(e) => setConcept(e.target.value)} aria-label="Concepto" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Monto (COP)"
        />
        <Input
          type="date"
          value={spentAt}
          onChange={(e) => setSpentAt(e.target.value)}
          aria-label="Fecha del gasto"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>
          Guardar
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </li>
  );
}
