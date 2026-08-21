import { useEffect, useState } from 'react';
import {
  type CreateResourceNeedInput,
  RESOURCE_CATEGORIES,
  ResourceCategory,
  type ResourceNeed,
  type ResourceNeedsOwnPage,
  Role,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/resource-form-fields';
import { NeedManageCard } from '../components/need-manage-card';
import { CATEGORY_LABELS } from '../model/resources-view';

const CATEGORY_OPTIONS = RESOURCE_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/**
 * `/organizacion/recursos` (M09, F-6) — gestión de necesidades de la
 * organización, usando SOLO endpoints ya existentes (`GET`/`POST
 * /resources/needs`). Publicar/editar: Owner/Administrator/Operator; ver: +
 * ReadOnlyAuditor (calcado de `ResourceNeedsController`'s @Roles).
 */
export function ResourcesPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [needs, setNeeds] = useState<ResourceNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ResourceCategory>(ResourceCategory.Food);
  const [quantityNeeded, setQuantityNeeded] = useState('');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);

  // ⚠️ Blindaje anti-regresión (patrón public-campaigns.ts): SIEMPRE se
  // normaliza `.items` a `[]` si la respuesta no trae un array.
  const load = async (): Promise<void> => {
    const page = await client.request<Partial<ResourceNeedsOwnPage>>('/resources/needs?limit=50');
    setNeeds(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Partial<ResourceNeedsOwnPage>>(
          '/resources/needs?limit=50',
        );
        if (active) setNeeds(Array.isArray(page?.items) ? page.items : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const resetForm = (): void => {
    setTitle('');
    setDescription('');
    setCategory(ResourceCategory.Food);
    setQuantityNeeded('');
    setUnit('');
  };

  const submit = async (): Promise<void> => {
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
      const body: CreateResourceNeedInput = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        quantityNeeded: quantity,
        unit: unit.trim(),
      };
      await client.request<ResourceNeed>('/resources/needs', { method: 'POST', json: body });
      resetForm();
      setShowForm(false);
      await load();
      toast({ title: 'Necesidad publicada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo publicar la necesidad',
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
        title="Banco de recursos"
        description="Publica las necesidades de tu organización y coordina las donaciones físicas que recibas."
        actions={canManage && <Button onClick={() => setShowForm(true)}>Publicar necesidad</Button>}
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {needs.length === 0 ? (
            <EmptyState
              icon={<span aria-hidden>📦</span>}
              title="Aún no hay necesidades publicadas"
              description={
                canManage
                  ? 'Publica la primera necesidad para empezar a recibir donaciones físicas.'
                  : undefined
              }
              action={
                canManage ? (
                  <Button onClick={() => setShowForm(true)}>Publicar tu primera necesidad</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {needs.map((need) => (
                <NeedManageCard key={need.id} need={need} />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={canManage && showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva necesidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="need-title" className="block text-sm font-medium text-foreground">
                Título
              </label>
              <Input
                id="need-title"
                placeholder="p. ej. Alimento para gatos"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <TextAreaField
              id="need-description"
              label="Descripción"
              value={description}
              onChange={setDescription}
              placeholder="Contexto adicional para el donante…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="need-category"
                label="Categoría"
                value={category}
                onChange={setCategory}
                options={CATEGORY_OPTIONS}
              />
              <div className="space-y-1.5">
                <label htmlFor="need-unit" className="block text-sm font-medium text-foreground">
                  Unidad
                </label>
                <Input
                  id="need-unit"
                  placeholder="p. ej. kg, unidades, bultos"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="need-quantity" className="block text-sm font-medium text-foreground">
                Cantidad necesitada
              </label>
              <Input
                id="need-quantity"
                type="number"
                min={1}
                step={1}
                placeholder="Cantidad"
                value={quantityNeeded}
                onChange={(e) => setQuantityNeeded(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Publicando…' : 'Publicar necesidad'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
