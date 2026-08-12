import { useEffect, useMemo, useState } from 'react';
import {
  type Animal,
  type AnimalSpecies,
  type AnimalStatus,
  type ComputedAge,
  type Organization,
  Role,
} from '@adoptafacil/contracts';
import {
  Badge,
  type BadgeVariant,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { AnimalDetailPanel } from '../components/animal-detail-panel';
import { AnimalFormModal } from '../components/animal-form-modal';
import { AnimalSponsorshipPlanModal } from '../components/animal-sponsorship-plan-modal';
import { BulkImportDialog } from '../components/bulk-import-dialog';
import { MissingSlugBanner } from '../components/missing-slug-banner';
import { PawEmptyIcon, PlusIcon, SearchIcon, UploadIcon } from '../components/icons';
import styles from './animals-page.module.scss';

const SPECIES_FILTER_OPTIONS: { value: 'all' | AnimalSpecies; label: string }[] = [
  { value: 'all', label: 'Todas las especies' },
  { value: 'dog', label: 'Perro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Otro' },
];

/** El mockup de este refactor listaba "En tratamiento"/"Reservado" como
 *  ejemplos ilustrativos, pero `AnimalStatus` (packages/contracts/src/
 *  animals.ts) no distingue esos matices — solo tiene estos 4 valores reales.
 *  Se etiquetan con los nombres reales en vez de inventar sub-estados. */
const STATUS_LABELS: Record<AnimalStatus, string> = {
  available: 'En adopción',
  in_process: 'En proceso',
  adopted: 'Adoptado',
  unavailable: 'No disponible',
};

const STATUS_BADGE_VARIANT: Record<AnimalStatus, BadgeVariant> = {
  available: 'success',
  in_process: 'info',
  adopted: 'secondary',
  unavailable: 'outline',
};

/** Etiqueta de edad derivada (calculada en la API). */
function ageLabel(age?: ComputedAge): string {
  if (!age) return 'Edad desconocida';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} a`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '0 m';
  return age.approximate ? `~${text}` : text;
}

/** `/animales` — expediente de animales (RF07, refactor visual maestro-
 *  detalle). Crear/editar/eliminar: Owner/Administrator/Operator/Veterinarian
 *  escriben (eliminar es más estricto: solo Owner/Administrator, ver
 *  `DELETE_ROLES` en el backend); ver: + ReadOnlyAuditor. Lista compacta a la
 *  izquierda, detalle del animal seleccionado a la derecha — mismos
 *  endpoints/props/validaciones que el catálogo de tarjetas que reemplaza. */
export function AnimalsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage =
    hasRole(Role.Owner) ||
    hasRole(Role.Administrator) ||
    hasRole(Role.Operator) ||
    hasRole(Role.Veterinarian);
  const canDelete = hasRole(Role.Owner) || hasRole(Role.Administrator);
  // S2-04B-1: narrower than `canManage` — Veterinarian may create/edit one
  // animal but not bulk-import (matches the backend's BULK_IMPORT_ROLES).
  const canBulkImport =
    hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  // S2-03-REV: matches `SponsorshipPlansController.WRITE_ROLES` VERBATIM — no
  // Operator/Veterinarian, unlike the broader `canManage` above (M07 money
  // gate is narrower than M03's own edit gate).
  const canManageSponsorship = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'all' | AnimalSpecies>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Animal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [sponsorshipTarget, setSponsorshipTarget] = useState<Animal | null>(null);
  // Problema real detectado (sin ningún aviso previo): un animal registrado
  // sin que la organización tenga `slug` configurado no aparece en el
  // catálogo público. `GET /org/profile` ya lo puede leer cualquier miembro
  // autenticado (sin RolesGuard) — mismo endpoint que usa `org-profile-page`,
  // ningún dato nuevo. `hasOrgSlug === null` mientras carga (no se asume "sin
  // slug" antes de tener la respuesta real).
  const [hasOrgSlug, setHasOrgSlug] = useState<boolean | null>(null);

  const load = async (): Promise<void> => {
    const items = await client.request<Animal[]>('/animals?includeInactive=true');
    setAnimals(items);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await client.request<Animal[]>('/animals?includeInactive=true');
        if (active) setAnimals(items);
      } finally {
        if (active) setLoading(false);
      }
    })();
    void client
      .request<Organization>('/org/profile')
      .then((org) => {
        if (active) setHasOrgSlug(Boolean(org.slug));
      })
      .catch(() => {
        // Best-effort: si falla, simplemente no se muestra el aviso — nunca
        // se bloquea la pantalla de Animales por esto.
      });
    return () => {
      active = false;
    };
  }, [client]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return animals.filter((animal) => {
      const matchesSearch = !q || animal.name.toLowerCase().includes(q);
      const matchesSpecies = speciesFilter === 'all' || animal.species === speciesFilter;
      return matchesSearch && matchesSpecies;
    });
  }, [animals, search, speciesFilter]);

  // Métricas reales sobre TODO lo ya cargado (`includeInactive=true`), no un
  // conteo nuevo del backend — "en tratamiento" del mockup se sustituyó por
  // "en proceso" (estado real) para no inventar un dato que la API no separa.
  const metrics = useMemo(() => {
    const active = animals.filter((a) => a.isActive !== false);
    return {
      activos: active.length,
      enAdopcion: active.filter((a) => a.status === 'available').length,
      enProceso: active.filter((a) => a.status === 'in_process').length,
    };
  }, [animals]);

  const selected = useMemo(
    () => animals.find((a) => a.id === selectedId) ?? null,
    [animals, selectedId],
  );

  function openCreateModal(): void {
    setEditingAnimal(null);
    setModalOpen(true);
  }

  const reactivate = async (animal: Animal): Promise<void> => {
    try {
      await client.request<Animal>(`/animals/${animal.id}/activate`, { method: 'POST' });
      await load();
      toast({ title: 'Animal reactivado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo reactivar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await client.request(`/animals/${deleteTarget.id}`, { method: 'DELETE' });
      await load();
      toast({ title: 'Animal eliminado', variant: 'success' });
      setDeleteTarget(null);
    } catch (error) {
      toast({
        title: 'No se pudo eliminar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Animales"
        description={
          loading
            ? undefined
            : `${metrics.activos} activos · ${metrics.enAdopcion} en adopción · ${metrics.enProceso} en proceso`
        }
        actions={
          <div className="flex gap-2">
            {canBulkImport && (
              <Button variant="outline" onClick={() => setBulkImportOpen(true)} className="gap-1.5">
                <UploadIcon /> Importar Excel
              </Button>
            )}
            {canManage && (
              <Button onClick={openCreateModal} className="gap-1.5">
                <PlusIcon /> Registrar animal
              </Button>
            )}
          </div>
        }
      />

      {hasOrgSlug === false && <MissingSlugBanner />}

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading &&
        (animals.length === 0 ? (
          <EmptyState
            icon={<PawEmptyIcon />}
            title="Registra tu primer animal para empezar"
            action={
              canManage ? (
                <Button onClick={openCreateModal} className="gap-1.5">
                  <PlusIcon /> Registrar tu primer animal
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <div className={cn('space-y-3', selectedId && 'hidden lg:block')}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar por nombre"
                    placeholder="Buscar por nombre…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <select
                  aria-label="Filtrar por especie"
                  value={speciesFilter}
                  onChange={(e) => setSpeciesFilter(e.target.value as 'all' | AnimalSpecies)}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-40"
                >
                  {SPECIES_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {filtered.length === 0 ? (
                <EmptyState title="Ningún animal coincide con la búsqueda" />
              ) : (
                <div className={styles.list}>
                  {filtered.map((animal) => {
                    const photo = animal.photos[0];
                    return (
                      <button
                        key={animal.id}
                        type="button"
                        onClick={() => setSelectedId(animal.id)}
                        className={cn(
                          styles.row,
                          animal.id === selectedId && styles['row--selected'],
                        )}
                        aria-current={animal.id === selectedId}
                      >
                        {photo ? (
                          <img src={photo} alt="" className={styles.row__avatar} />
                        ) : (
                          <div aria-hidden className={styles['row__avatar-fallback']}>
                            <PawEmptyIcon />
                          </div>
                        )}
                        <div className={styles.row__body}>
                          <p className={styles.row__name}>{animal.name}</p>
                          <p className={styles.row__meta}>
                            {animal.breed ? `${animal.breed} · ` : ''}
                            {ageLabel(animal.computedAge)}
                          </p>
                        </div>
                        <div className={styles.row__badges}>
                          <Badge variant={STATUS_BADGE_VARIANT[animal.status]}>
                            {STATUS_LABELS[animal.status]}
                          </Badge>
                          {animal.isActive === false && (
                            <Badge variant="destructive">Inactivo</Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={cn(!selectedId && 'hidden lg:block')}>
              {selected ? (
                <AnimalDetailPanel
                  animal={selected}
                  canManage={canManage}
                  canDelete={canDelete}
                  canManageSponsorship={canManageSponsorship}
                  onEdit={(a) => {
                    setEditingAnimal(a);
                    setModalOpen(true);
                  }}
                  onDelete={setDeleteTarget}
                  onSponsor={setSponsorshipTarget}
                  onReactivate={(a) => void reactivate(a)}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <EmptyState
                  icon={<PawEmptyIcon />}
                  title="Selecciona un animal para ver su detalle"
                />
              )}
            </div>
          </div>
        ))}

      <AnimalFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        animal={editingAnimal}
        onSaved={() => void load()}
        showMissingSlugWarning={hasOrgSlug === false}
      />

      <BulkImportDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onImported={() => void load()}
      />

      {sponsorshipTarget && (
        <AnimalSponsorshipPlanModal
          open={sponsorshipTarget !== null}
          onOpenChange={(next) => !next && setSponsorshipTarget(null)}
          animalId={sponsorshipTarget.id}
          animalName={sponsorshipTarget.name}
        />
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar a {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
