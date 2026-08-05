import { useEffect, useState } from 'react';
import {
  type Campaign,
  CampaignCategory,
  type CreateCampaignInput,
  type Paginated,
  Role,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

const CATEGORY_LABELS: Record<CampaignCategory, string> = {
  [CampaignCategory.Medications]: 'Medicamentos',
  [CampaignCategory.Food]: 'Alimentación',
  [CampaignCategory.Surgeries]: 'Cirugías',
  [CampaignCategory.Sterilizations]: 'Esterilizaciones',
  [CampaignCategory.Infrastructure]: 'Infraestructura',
  [CampaignCategory.Emergencies]: 'Emergencias',
};

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function formatCO(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
}

/** `/campanas` — campañas de recaudación (RF15). Crear/editar:
 *  Owner/Administrator/Operator; ver: + ReadOnlyAuditor. */
export function CampaignsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CampaignCategory>(CampaignCategory.Medications);
  const [goalAmount, setGoalAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    const page = await client.request<Paginated<Campaign>>('/campaigns?limit=50');
    setCampaigns(page.items);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Paginated<Campaign>>('/campaigns?limit=50');
        if (active) setCampaigns(page.items);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const submit = async (): Promise<void> => {
    const goal = Number(goalAmount);
    if (!title.trim() || !deadline || !Number.isInteger(goal) || goal <= 0) {
      toast({
        title: 'Datos incompletos',
        description: 'Título, meta (entero COP > 0), fecha límite y categoría son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: CreateCampaignInput = {
        title: title.trim(),
        category,
        goalAmount: goal,
        deadline: new Date(deadline).toISOString(),
      };
      await client.request<Campaign>('/campaigns', { method: 'POST', json: body });
      setTitle('');
      setGoalAmount('');
      setDeadline('');
      await load();
      toast({ title: 'Campaña creada' });
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
      <PageHeader title="Campañas" description="Campañas de recaudación de tu organización." />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Nueva campaña</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Título"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <select
                  aria-label="Categoría"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CampaignCategory)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(Object.keys(CATEGORY_LABELS) as CampaignCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Meta (COP)"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="Fecha límite"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <Button disabled={saving} onClick={() => void submit()}>
                  Crear campaña
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Campañas</CardTitle>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay campañas.</p>
              ) : (
                <ul className="space-y-3">
                  {campaigns.map((c) => (
                    <li key={c.id} className="border-b pb-2 text-sm last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.title}</span>
                        <Badge variant="secondary">{CATEGORY_LABELS[c.category]}</Badge>
                        <Badge>{c.status}</Badge>
                        <span className="text-muted-foreground">
                          {COP.format(c.raisedAmount)} / {COP.format(c.goalAmount)} (
                          {Math.round(c.progress * 100)}%)
                        </span>
                        <span className="text-muted-foreground">
                          · vence {formatCO(c.deadline)}
                        </span>
                      </div>
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
