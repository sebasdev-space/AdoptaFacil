import { useEffect, useState } from 'react';
import {
  type Paginated,
  type SponsorshipPlan,
  SponsorshipPeriodicity,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';

/** Feature-local (same duplication convention as `formatBogota`/`formatCop`
 *  elsewhere in the repo, e.g. `features/sponsorships/model/sponsorships-view.ts`)
 *  rather than a cross-feature import — `animals` and `sponsorships` stay decoupled. */
function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

export interface AnimalSponsorshipPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * S2-03-REV (Objetivo #1, M07/RF17) — activar/gestionar el plan de
 * apadrinamiento de UN animal, desde la ficha (`/animales`, dominio M03).
 * PRERREQUISITO del resto del módulo: sin un plan activo, `SponsorPage`
 * (`features/sponsorships`) siempre muestra "sin plan activo" y el animal
 * nunca aparece apadrinable en el portal público.
 *
 * Consume SOLO endpoints ya existentes de `SponsorshipPlansController`:
 * `GET /sponsorship-plans?animalId=` (¿ya tiene uno?), `POST
 * /sponsorship-plans` (crear) y `PATCH /sponsorship-plans/:id` (activar/
 * desactivar). Un solo plan mensual por este spec — `periodicity` no se
 * ofrece elegir, el enum del backend ya está cerrado a `monthly`.
 *
 * Simplificación MVP: si el animal ya tuviera más de un plan (no impedido
 * por el backend), se gestiona solo el primero devuelto — este spec asume
 * como mucho un plan por animal, igual que el resto de M07 en Ola 2.
 */
export function AnimalSponsorshipPlanModal({
  open,
  onOpenChange,
  animalId,
  animalName,
}: AnimalSponsorshipPlanModalProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>('loading');
  const [plan, setPlan] = useState<SponsorshipPlan | null>(null);
  const [name, setName] = useState('Apadrinamiento mensual');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setState('loading');
    client
      .request<Paginated<SponsorshipPlan>>(`/sponsorship-plans?animalId=${animalId}&limit=1`)
      .then((page) => {
        if (!active) return;
        setPlan(page.items[0] ?? null);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [client, animalId, open]);

  async function createPlan(): Promise<void> {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({
        title: 'Monto inválido',
        description: 'Indica un monto mensual mayor a 0.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const created = await client.request<SponsorshipPlan>('/sponsorship-plans', {
        method: 'POST',
        json: {
          animalId,
          name: name.trim() || 'Apadrinamiento mensual',
          amount: Math.round(parsed),
          periodicity: SponsorshipPeriodicity.Monthly,
        },
      });
      setPlan(created);
      toast({
        title: 'Plan de apadrinamiento creado',
        description: `${animalName} ya puede recibir padrinos.`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo crear el plan',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(): Promise<void> {
    if (!plan) return;
    setSaving(true);
    try {
      const updated = await client.request<SponsorshipPlan>(`/sponsorship-plans/${plan.id}`, {
        method: 'PATCH',
        json: { isActive: !plan.isActive },
      });
      setPlan(updated);
      toast({
        title: updated.isActive ? 'Plan activado' : 'Plan desactivado',
        description: updated.isActive
          ? `${animalName} ya puede recibir padrinos.`
          : `${animalName} ya no acepta nuevos padrinos (los existentes no se ven afectados).`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar el plan',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apadrinamiento de {animalName}</DialogTitle>
          <DialogDescription>
            Plan mensual único (RF17). Actívalo para que las Personas puedan apadrinar a{' '}
            {animalName} desde el portal público.
          </DialogDescription>
        </DialogHeader>

        {state === 'loading' && <Skeleton className="h-24 w-full" />}
        {state === 'error' && (
          <p className="text-sm text-destructive">
            No se pudo cargar el plan de apadrinamiento. Inténtalo de nuevo.
          </p>
        )}

        {state === 'ready' && plan && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-muted-foreground">{formatCop(plan.amount)} / mes</p>
              </div>
              <Badge variant={plan.isActive ? 'success' : 'secondary'}>
                {plan.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <Button variant="outline" disabled={saving} onClick={() => void toggleActive()}>
              {saving ? 'Guardando…' : plan.isActive ? 'Desactivar plan' : 'Activar plan'}
            </Button>
          </div>
        )}

        {state === 'ready' && !plan && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {animalName} todavía no tiene un plan de apadrinamiento. Crea uno para que aparezca
              disponible en el portal público.
            </p>
            <Input
              aria-label="Nombre del plan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del plan"
            />
            <Input
              aria-label="Monto mensual (COP)"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Monto mensual (COP)"
            />
            <Button disabled={saving} onClick={() => void createPlan()}>
              {saving ? 'Creando…' : 'Crear plan'}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
