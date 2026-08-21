import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type CompleteResourceDeliveryInput,
  RESOURCE_CATEGORIES,
  type ResourceCategory,
  type ResourceDelivery,
  type ResourceDeliveriesPage,
  type ResourceDeliveryEvidence,
  type ResourceDeliveryEvidenceUploadResult,
  ResourceDeliveryMethod,
  ResourceDeliveryStatus,
  type ResourceNeed,
  ResourceNeedStatus,
  type ResourceOffer,
  ResourceOfferStatus,
  Role,
  type ScheduleResourceDeliveryInput,
  type UpdateResourceNeedInput,
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
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/resource-form-fields';
import { NeedProgress } from '../components/need-progress';
import { EVIDENCE_ACCEPT, uploadEvidenceFile, validateEvidenceUpload } from '../lib/storage';
import {
  CATEGORY_LABELS,
  DELIVERY_STATUS_LABELS,
  NEED_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  formatBogota,
  needStatusVariant,
  offerStatusVariant,
} from '../model/resources-view';

const CATEGORY_OPTIONS = RESOURCE_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));
const METHOD_LABELS: Record<ResourceDeliveryMethod, string> = {
  [ResourceDeliveryMethod.Pickup]: 'El donante lo trae',
  [ResourceDeliveryMethod.Dropoff]: 'La organización lo recoge',
};
const METHOD_OPTIONS = Object.values(ResourceDeliveryMethod).map((value) => ({
  value,
  label: METHOD_LABELS[value],
}));

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** `YYYY-MM-DDTHH:mm:ssZ` → `YYYY-MM-DD` for a native date input. */
function toDateInputValue(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/**
 * `/organizacion/recursos/:id` (M09, F-6) — detalle interno de una necesidad:
 * editarla, decidir sobre las ofertas recibidas y coordinar sus entregas
 * (método/fecha, evidencia, cierre). Editar/decidir/coordinar:
 * Owner/Administrator/Operator; ver: + ReadOnlyAuditor.
 */
export function ResourceNeedDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>('loading');
  const [need, setNeed] = useState<ResourceNeed | null>(null);
  const [offers, setOffers] = useState<ResourceOffer[]>([]);
  const [deliveries, setDeliveries] = useState<ResourceDelivery[]>([]);
  const [evidencesByDelivery, setEvidencesByDelivery] = useState<
    Record<string, ResourceDeliveryEvidence[]>
  >({});

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ResourceCategory>('food' as ResourceCategory);
  const [quantityNeeded, setQuantityNeeded] = useState('');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const applyNeed = (found: ResourceNeed): void => {
    setNeed(found);
    setTitle(found.title);
    setDescription(found.description ?? '');
    setCategory(found.category);
    setQuantityNeeded(String(found.quantityNeeded));
    setUnit(found.unit);
  };

  const loadEvidences = async (deliveryId: string): Promise<void> => {
    const rows = await client.request<ResourceDeliveryEvidence[]>(
      `/resources/deliveries/${encodeURIComponent(deliveryId)}/evidences`,
    );
    setEvidencesByDelivery((prev) => ({ ...prev, [deliveryId]: Array.isArray(rows) ? rows : [] }));
  };

  const loadAll = async (): Promise<void> => {
    if (!id) return;
    const [offersPage, deliveriesPage] = await Promise.all([
      client.request<ResourceOffer[]>('/resources/offers/received'),
      client.request<Partial<ResourceDeliveriesPage>>('/resources/deliveries?limit=50'),
    ]);
    const ourOffers = (Array.isArray(offersPage) ? offersPage : []).filter((o) => o.needId === id);
    const deliveryItems = Array.isArray(deliveriesPage?.items) ? deliveriesPage.items : [];
    const ourDeliveries = deliveryItems.filter((d) => d.needId === id);
    setOffers(ourOffers);
    setDeliveries(ourDeliveries);
    await Promise.all(ourDeliveries.map((d) => loadEvidences(d.id)));
  };

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const found = await client.request<ResourceNeed>(
          `/resources/needs/${encodeURIComponent(id)}`,
        );
        if (!active) return;
        applyNeed(found);
        await loadAll();
        if (active) setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [client, id]);

  const submitNeed = async (): Promise<void> => {
    if (!id) return;
    const quantity = Number(quantityNeeded);
    if (!title.trim() || !unit.trim() || !Number.isInteger(quantity) || quantity <= 0) {
      toast({
        title: 'Datos incompletos',
        description: 'Título, categoría, cantidad (entero > 0) y unidad son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: UpdateResourceNeedInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        quantityNeeded: quantity,
        unit: unit.trim(),
      };
      const updated = await client.request<ResourceNeed>(
        `/resources/needs/${encodeURIComponent(id)}`,
        { method: 'PATCH', json: body },
      );
      applyNeed(updated);
      toast({ title: 'Necesidad actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la necesidad',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelNeed = async (): Promise<void> => {
    if (!id) return;
    try {
      const updated = await client.request<ResourceNeed>(
        `/resources/needs/${encodeURIComponent(id)}`,
        { method: 'PATCH', json: { status: ResourceNeedStatus.Cancelled } },
      );
      applyNeed(updated);
      toast({ title: 'Necesidad cancelada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo cancelar la necesidad',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const decideOffer = async (offerId: string, decision: 'accept' | 'decline'): Promise<void> => {
    try {
      await client.request(`/resources/offers/${encodeURIComponent(offerId)}/decision`, {
        method: 'PATCH',
        json: { decision },
      });
      if (id) {
        const refreshedNeed = await client.request<ResourceNeed>(
          `/resources/needs/${encodeURIComponent(id)}`,
        );
        applyNeed(refreshedNeed);
      }
      await loadAll();
      toast({
        title: decision === 'accept' ? 'Oferta aceptada' : 'Oferta rechazada',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo decidir la oferta',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const scheduleDelivery = async (
    deliveryId: string,
    input: ScheduleResourceDeliveryInput,
  ): Promise<void> => {
    try {
      await client.request(`/resources/deliveries/${encodeURIComponent(deliveryId)}`, {
        method: 'PATCH',
        json: input,
      });
      await loadAll();
      toast({ title: 'Entrega actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la entrega',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const completeDelivery = async (
    deliveryId: string,
    input: CompleteResourceDeliveryInput,
  ): Promise<void> => {
    try {
      await client.request(`/resources/deliveries/${encodeURIComponent(deliveryId)}/complete`, {
        method: 'PATCH',
        json: input,
      });
      if (id) {
        const refreshedNeed = await client.request<ResourceNeed>(
          `/resources/needs/${encodeURIComponent(id)}`,
        );
        applyNeed(refreshedNeed);
      }
      await loadAll();
      toast({ title: 'Entrega completada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo completar la entrega',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const cancelDelivery = async (deliveryId: string): Promise<void> => {
    try {
      await client.request(`/resources/deliveries/${encodeURIComponent(deliveryId)}/cancel`, {
        method: 'PATCH',
      });
      await loadAll();
      toast({ title: 'Entrega cancelada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo cancelar la entrega',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const uploadEvidence = async (deliveryId: string, file: File, caption: string): Promise<void> => {
    const invalid = validateEvidenceUpload(file);
    if (invalid) {
      toast({ title: 'Archivo no válido', description: invalid, variant: 'warning' });
      return;
    }
    try {
      const result = await client.request<ResourceDeliveryEvidenceUploadResult>(
        `/resources/deliveries/${encodeURIComponent(deliveryId)}/evidences`,
        {
          method: 'POST',
          json: {
            filename: file.name,
            contentType: file.type || undefined,
            caption: caption.trim() || undefined,
          },
        },
      );
      await uploadEvidenceFile(client, result.upload.key, file);
      await loadEvidences(deliveryId);
      toast({ title: 'Evidencia agregada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo agregar la evidencia',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const removeEvidence = async (deliveryId: string, evidenceId: string): Promise<void> => {
    try {
      await client.request(
        `/resources/deliveries/${encodeURIComponent(deliveryId)}/evidences/${encodeURIComponent(evidenceId)}`,
        { method: 'DELETE' },
      );
      await loadEvidences(deliveryId);
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
        title="Detalle de la necesidad"
        description="Edita la necesidad, decide sobre las ofertas recibidas y coordina las entregas."
      />
      <Link
        to="/organizacion/recursos"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver al banco de recursos
      </Link>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'not-found' && (
        <EmptyState title="Necesidad no especificada" description="Falta el identificador." />
      )}
      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}

      {state === 'ready' && need && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {need.title}
                <Badge variant="secondary">{CATEGORY_LABELS[need.category]}</Badge>
                <Badge variant={needStatusVariant(need.status)}>
                  {NEED_STATUS_LABELS[need.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NeedProgress
                quantityFulfilled={need.quantityFulfilled}
                quantityNeeded={need.quantityNeeded}
                unit={need.unit}
                progress={need.progress}
              />
              <Link
                to={`/recursos/${encodeURIComponent(need.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Ver cómo se ve en público →
              </Link>
            </CardContent>
          </Card>

          {canManage && need.status !== ResourceNeedStatus.Cancelled && (
            <Card>
              <CardHeader>
                <CardTitle>Editar necesidad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="need-edit-title"
                    className="block text-sm font-medium text-foreground"
                  >
                    Título
                  </label>
                  <Input
                    id="need-edit-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <TextAreaField
                  id="need-edit-description"
                  label="Descripción"
                  value={description}
                  onChange={setDescription}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <SelectField
                    id="need-edit-category"
                    label="Categoría"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORY_OPTIONS}
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="need-edit-quantity"
                      className="block text-sm font-medium text-foreground"
                    >
                      Cantidad necesitada
                    </label>
                    <Input
                      id="need-edit-quantity"
                      type="number"
                      min={1}
                      step={1}
                      value={quantityNeeded}
                      onChange={(e) => setQuantityNeeded(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="need-edit-unit"
                      className="block text-sm font-medium text-foreground"
                    >
                      Unidad
                    </label>
                    <Input
                      id="need-edit-unit"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button disabled={saving} onClick={() => void submitNeed()}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                  <Button variant="outline" onClick={() => void cancelNeed()}>
                    Cancelar necesidad
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Ofertas recibidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {offers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aún no hay ofertas para esta necesidad.
                </p>
              )}
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  data-testid="received-offer-row"
                >
                  <div>
                    <p className="font-medium">
                      {offer.quantityOffered} {need.unit}
                    </p>
                    {offer.message && (
                      <p className="text-xs text-muted-foreground">{offer.message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={offerStatusVariant(offer.status)}>
                      {OFFER_STATUS_LABELS[offer.status]}
                    </Badge>
                    {canManage && offer.status === ResourceOfferStatus.Offered && (
                      <>
                        <Button size="sm" onClick={() => void decideOffer(offer.id, 'accept')}>
                          Aceptar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void decideOffer(offer.id, 'decline')}
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {deliveries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Entregas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {deliveries.map((delivery) => (
                  <DeliveryPanel
                    key={delivery.id}
                    delivery={delivery}
                    evidences={evidencesByDelivery[delivery.id] ?? []}
                    canManage={canManage}
                    onSchedule={(input) => scheduleDelivery(delivery.id, input)}
                    onComplete={(input) => completeDelivery(delivery.id, input)}
                    onCancel={() => cancelDelivery(delivery.id)}
                    onUploadEvidence={(file, caption) => uploadEvidence(delivery.id, file, caption)}
                    onRemoveEvidence={(evidenceId) => removeEvidence(delivery.id, evidenceId)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}

interface DeliveryPanelProps {
  delivery: ResourceDelivery;
  evidences: ResourceDeliveryEvidence[];
  canManage: boolean;
  onSchedule: (input: ScheduleResourceDeliveryInput) => void;
  onComplete: (input: CompleteResourceDeliveryInput) => void;
  onCancel: () => void;
  onUploadEvidence: (file: File, caption: string) => void;
  onRemoveEvidence: (evidenceId: string) => void;
}

/** Un panel por entrega: programar método/fecha, cerrar (con cantidad real
 *  opcional) o cancelar, y gestionar su evidencia fotográfica. */
function DeliveryPanel({
  delivery,
  evidences,
  canManage,
  onSchedule,
  onComplete,
  onCancel,
  onUploadEvidence,
  onRemoveEvidence,
}: DeliveryPanelProps) {
  const [method, setMethod] = useState<ResourceDeliveryMethod>(
    delivery.method ?? ResourceDeliveryMethod.Dropoff,
  );
  const [scheduledAt, setScheduledAt] = useState(toDateInputValue(delivery.scheduledAt));
  const [actualQuantity, setActualQuantity] = useState('');
  const [evidenceCaption, setEvidenceCaption] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const scheduled = delivery.status === ResourceDeliveryStatus.Scheduled;

  return (
    <div className="space-y-3 rounded-md border p-4" data-testid="delivery-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary">{DELIVERY_STATUS_LABELS[delivery.status]}</Badge>
        {delivery.scheduledAt && (
          <span className="text-xs text-muted-foreground">
            Programada: {formatBogota(delivery.scheduledAt)}
          </span>
        )}
      </div>

      {canManage && scheduled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id={`delivery-method-${delivery.id}`}
              label="Método"
              value={method}
              onChange={setMethod}
              options={METHOD_OPTIONS}
            />
            <div className="space-y-1.5">
              <label
                htmlFor={`delivery-date-${delivery.id}`}
                className="block text-sm font-medium text-foreground"
              >
                Fecha
              </label>
              <Input
                id={`delivery-date-${delivery.id}`}
                type="date"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                onSchedule({
                  method,
                  scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
                })
              }
            >
              Guardar programación
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`delivery-actual-${delivery.id}`}
                className="block text-sm font-medium text-foreground"
              >
                Cantidad realmente entregada (opcional)
              </label>
              <Input
                id={`delivery-actual-${delivery.id}`}
                type="number"
                min={1}
                step={1}
                placeholder="Si es igual a lo ofrecido, déjalo vacío"
                value={actualQuantity}
                onChange={(e) => setActualQuantity(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                const parsed = Number(actualQuantity);
                onComplete(
                  actualQuantity.trim() && Number.isInteger(parsed) && parsed > 0
                    ? { actualQuantity: parsed }
                    : {},
                );
              }}
            >
              Marcar como completada
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancelar entrega
            </Button>
          </div>
        </>
      )}

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-medium">Evidencia</p>
        {evidences.length === 0 && (
          <p className="text-xs text-muted-foreground">Aún no hay evidencia para esta entrega.</p>
        )}
        {evidences.length > 0 && (
          <ul className="space-y-2" data-testid="evidence-list">
            {evidences.map((evidence) => (
              <li key={evidence.id} className="flex items-center justify-between gap-2 text-xs">
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {evidence.caption || 'Ver evidencia'}
                </a>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => onRemoveEvidence(evidence.id)}>
                    Eliminar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="Descripción (opcional)"
              value={evidenceCaption}
              onChange={(e) => setEvidenceCaption(e.target.value)}
              className="max-w-xs"
            />
            <input
              type="file"
              accept={EVIDENCE_ACCEPT.join(',')}
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            <Button
              size="sm"
              disabled={!evidenceFile}
              onClick={() => {
                if (evidenceFile) {
                  onUploadEvidence(evidenceFile, evidenceCaption);
                  setEvidenceFile(null);
                  setEvidenceCaption('');
                }
              }}
            >
              Subir
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
