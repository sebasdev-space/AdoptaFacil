import { useEffect, useState } from 'react';
import {
  type Campaign,
  CAMPAIGN_CATEGORIES,
  CampaignCategory,
  type CreateCampaignInput,
  type Paginated,
  Role,
} from '@adoptafacil/contracts';
import {
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
import { SelectField, TextAreaField } from '../components/campaign-form-fields';
import { CampaignManageCard } from '../components/campaign-manage-card';
import { CATEGORY_LABELS } from '../model/campaigns-view';

const CATEGORY_OPTIONS = CAMPAIGN_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/**
 * `/organizacion/campanas` (S2-01) — gestión de campañas de recaudación de la
 * organización, usando SOLO endpoints ya existentes (`GET`/`POST /campaigns`).
 * Crear/editar: Owner/Administrator/Operator; ver: + ReadOnlyAuditor (calcado de
 * `CampaignsController`'s @Roles — "Coordinator", mencionado en el spec original,
 * no existe como rol real).
 */
export function CampaignsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CampaignCategory>(CampaignCategory.Medications);
  const [goalAmount, setGoalAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  // ⚠️ Blindaje anti-regresión (patrón de public-campaigns.ts): SIEMPRE se
  // normaliza `.items` a `[]` si la respuesta no trae un array, para que
  // ningún consumidor haga `.map`/`.length` sobre un no-array.
  const load = async (): Promise<void> => {
    const page = await client.request<Partial<Paginated<Campaign>>>('/campaigns?limit=50');
    setCampaigns(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Partial<Paginated<Campaign>>>('/campaigns?limit=50');
        if (active) setCampaigns(Array.isArray(page?.items) ? page.items : []);
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
    setCategory(CampaignCategory.Medications);
    setGoalAmount('');
    setDeadline('');
  };

  const submit = async (): Promise<void> => {
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
      const body: CreateCampaignInput = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        goalAmount: goal,
        deadline: new Date(deadline).toISOString(),
      };
      await client.request<Campaign>('/campaigns', { method: 'POST', json: body });
      resetForm();
      setShowForm(false);
      await load();
      toast({ title: 'Campaña creada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo crear la campaña',
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
        title="Campañas de recaudación"
        description="Gestiona las campañas de recaudación de tu organización."
        actions={
          canManage && (
            <Button onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancelar' : 'Crear campaña'}
            </Button>
          )
        }
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {canManage && showForm && (
            <Card>
              <CardHeader>
                <CardTitle>Nueva campaña</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="campaign-title"
                    className="block text-sm font-medium text-foreground"
                  >
                    Título
                  </label>
                  <Input
                    id="campaign-title"
                    placeholder="Título de la campaña"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <TextAreaField
                  id="campaign-description"
                  label="Descripción"
                  value={description}
                  onChange={setDescription}
                  placeholder="Cuéntale a los donantes para qué es esta campaña…"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id="campaign-category"
                    label="Categoría"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORY_OPTIONS}
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="campaign-goal"
                      className="block text-sm font-medium text-foreground"
                    >
                      Meta (COP)
                    </label>
                    <Input
                      id="campaign-goal"
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Meta en pesos"
                      value={goalAmount}
                      onChange={(e) => setGoalAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="campaign-deadline"
                    className="block text-sm font-medium text-foreground"
                  >
                    Fecha límite
                  </label>
                  <Input
                    id="campaign-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
                <Button disabled={saving} onClick={() => void submit()}>
                  {saving ? 'Creando…' : 'Crear campaña'}
                </Button>
              </CardContent>
            </Card>
          )}

          {campaigns.length === 0 ? (
            <EmptyState
              icon={<span aria-hidden>📣</span>}
              title="Aún no hay campañas de recaudación"
              description={
                canManage ? 'Crea la primera campaña para empezar a recaudar fondos.' : undefined
              }
              action={
                canManage ? (
                  <Button onClick={() => setShowForm(true)}>Crear tu primera campaña</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign) => (
                <CampaignManageCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
