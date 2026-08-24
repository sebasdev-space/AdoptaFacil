import { useEffect, useState } from 'react';
import {
  type CreateVolunteerOpportunityInput,
  type Paginated,
  Role,
  type VolunteerOpportunity,
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
import { VolunteerOpportunityManageCard } from '../components/volunteer-opportunity-manage-card';

/**
 * `/organizacion/voluntariado` (RF18, M08) — gestión de oportunidades de
 * voluntariado de la organización. Publicar/editar: Owner/Administrator
 * (calcado del `@Roles` real de `VolunteerOpportunitiesController` —
 * `Operator` queda fuera hasta que el documento base defina su alcance).
 */
export function VolunteerOpportunitiesPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [location, setLocation] = useState('');
  const [requirements, setRequirements] = useState('');
  const [appliesToStudentService, setAppliesToStudentService] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    const page = await client.request<Partial<Paginated<VolunteerOpportunity>>>(
      '/volunteer-opportunities?limit=50',
    );
    setOpportunities(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Partial<Paginated<VolunteerOpportunity>>>(
          '/volunteer-opportunities?limit=50',
        );
        if (active) setOpportunities(Array.isArray(page?.items) ? page.items : []);
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
    setCategory('');
    setStartDate('');
    setEndDate('');
    setCapacity('');
    setLocation('');
    setRequirements('');
    setAppliesToStudentService(false);
  };

  const submit = async (): Promise<void> => {
    if (!title.trim() || !category.trim() || !startDate || !endDate || !location.trim()) {
      toast({
        title: 'Datos incompletos',
        description: 'Título, categoría, rango de fechas y ubicación son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      toast({
        title: 'Fechas inválidas',
        description: 'La fecha de fin debe ser posterior a la fecha de inicio.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: CreateVolunteerOpportunityInput = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category: category.trim(),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        ...(capacity.trim() ? { capacity: Number(capacity) } : {}),
        location: location.trim(),
        ...(requirements.trim() ? { requirements: requirements.trim() } : {}),
        appliesToStudentService,
      };
      await client.request<VolunteerOpportunity>('/volunteer-opportunities', {
        method: 'POST',
        json: body,
      });
      resetForm();
      setShowForm(false);
      await load();
      toast({ title: 'Oportunidad publicada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo publicar la oportunidad',
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
        title="Voluntariado"
        description="Publica oportunidades de voluntariado y gestiona inscripciones, horas y certificados."
        actions={
          canManage && <Button onClick={() => setShowForm(true)}>Publicar oportunidad</Button>
        }
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {opportunities.length === 0 ? (
            <EmptyState
              icon={<span aria-hidden>🙋</span>}
              title="Aún no hay oportunidades de voluntariado"
              description={
                canManage ? 'Publica la primera oportunidad para recibir inscripciones.' : undefined
              }
              action={
                canManage ? (
                  <Button onClick={() => setShowForm(true)}>Publicar tu primera oportunidad</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {opportunities.map((opportunity) => (
                <VolunteerOpportunityManageCard key={opportunity.id} opportunity={opportunity} />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={canManage && showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva oportunidad de voluntariado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="vo-title" className="block text-sm font-medium text-foreground">
                Título
              </label>
              <Input id="vo-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vo-description" className="block text-sm font-medium text-foreground">
                Descripción
              </label>
              <Input
                id="vo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="vo-category" className="block text-sm font-medium text-foreground">
                  Categoría
                </label>
                <Input
                  id="vo-category"
                  placeholder="p. ej. Cuidado de animales"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="vo-capacity" className="block text-sm font-medium text-foreground">
                  Cupo (opcional)
                </label>
                <Input
                  id="vo-capacity"
                  type="number"
                  min={1}
                  step={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="vo-start" className="block text-sm font-medium text-foreground">
                  Fecha de inicio
                </label>
                <Input
                  id="vo-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="vo-end" className="block text-sm font-medium text-foreground">
                  Fecha de fin
                </label>
                <Input
                  id="vo-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vo-location" className="block text-sm font-medium text-foreground">
                Ubicación
              </label>
              <Input
                id="vo-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="vo-requirements"
                className="block text-sm font-medium text-foreground"
              >
                Requisitos (opcional)
              </label>
              <Input
                id="vo-requirements"
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={appliesToStudentService}
                onChange={(e) => setAppliesToStudentService(e.target.checked)}
              />
              Cuenta como servicio social estudiantil obligatorio (Resolución 4210/1996)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Publicando…' : 'Publicar oportunidad'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
