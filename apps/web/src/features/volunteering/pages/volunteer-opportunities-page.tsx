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
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { VolunteerOpportunityManageCard } from '../components/volunteer-opportunity-manage-card';

/**
 * `/organizacion/voluntariado` (RF18, M08) - gestión de oportunidades de
 * voluntariado de la organización. Publicar/editar: Owner/Administrator.
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

  const activeCount = opportunities.filter((o) => o.status === 'active').length;
  const closedCount = opportunities.filter((o) => o.status !== 'active').length;

  return (
    <PageContainer>
      <PageHeader
        title="Voluntariado"
        description="Publica oportunidades de voluntariado y gestiona inscripciones, horas y certificados."
        actions={
          canManage && (
            <Button onClick={() => setShowForm(true)}>
              <span aria-hidden className="mr-1.5">
                +
              </span>
              Publicar oportunidad
            </Button>
          )
        }
      />

      {!loading && opportunities.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-success"
            />
            {activeCount} {activeCount === 1 ? 'activa' : 'activas'}
          </span>
          {closedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {closedCount} cerrada{closedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {opportunities.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
                🙋
              </div>
              <p className="text-base font-semibold text-foreground">
                Aún no hay oportunidades de voluntariado
              </p>
              {canManage && (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Publica la primera para empezar a recibir inscripciones.
                  </p>
                  <Button className="mt-5" onClick={() => setShowForm(true)}>
                    Publicar tu primera oportunidad
                  </Button>
                </>
              )}
            </div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Nueva oportunidad de voluntariado</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Información básica
              </p>
              <div className="space-y-1.5">
                <label htmlFor="vo-title" className="block text-sm font-medium text-foreground">
                  Título <span className="text-destructive">*</span>
                </label>
                <Input
                  id="vo-title"
                  placeholder="p. ej. Jornada de esterilización"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="vo-description"
                  className="block text-sm font-medium text-foreground"
                >
                  Descripción
                </label>
                <Input
                  id="vo-description"
                  placeholder="Describe brevemente la actividad..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="vo-category"
                    className="block text-sm font-medium text-foreground"
                  >
                    Categoría <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="vo-category"
                    placeholder="p. ej. Cuidado de animales"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="vo-capacity"
                    className="block text-sm font-medium text-foreground"
                  >
                    Cupo (opcional)
                  </label>
                  <Input
                    id="vo-capacity"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Sin límite"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fechas y lugar
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="vo-start" className="block text-sm font-medium text-foreground">
                    Fecha de inicio <span className="text-destructive">*</span>
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
                    Fecha de fin <span className="text-destructive">*</span>
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
                  Ubicación <span className="text-destructive">*</span>
                </label>
                <Input
                  id="vo-location"
                  placeholder="p. ej. Albergue central, Bogotá"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Requisitos y opciones
              </p>
              <div className="space-y-1.5">
                <label
                  htmlFor="vo-requirements"
                  className="block text-sm font-medium text-foreground"
                >
                  Requisitos (opcional)
                </label>
                <Input
                  id="vo-requirements"
                  placeholder="p. ej. Mayor de 18 años, certificado de vacunas..."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-foreground transition-colors hover:bg-info/10">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={appliesToStudentService}
                  onChange={(e) => setAppliesToStudentService(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Cuenta como servicio social estudiantil</span>
                  <span className="block text-xs text-muted-foreground">
                    Resolución 4210/1996 — los inscritos podrán solicitar constancia oficial.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Publicando...' : 'Publicar oportunidad'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
