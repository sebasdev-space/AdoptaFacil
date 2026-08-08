import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type Animal,
  type AnimalSex,
  type AnimalSpecies,
  type ComputedAge,
  Role,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
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
import { AnimalFormModal } from '../components/animal-form-modal';
import { AnimalSponsorshipPlanModal } from '../components/animal-sponsorship-plan-modal';
import { BulkImportDialog } from '../components/bulk-import-dialog';
import {
  FolderIcon,
  HeartIcon,
  PawEmptyIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from '../components/icons';

const SPECIES_LABELS: Record<AnimalSpecies, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otro',
};

const SEX_LABELS: Record<AnimalSex, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Desconocido',
};

const SPECIES_FILTER_OPTIONS: { value: 'all' | AnimalSpecies; label: string }[] = [
  { value: 'all', label: 'Todas las especies' },
  { value: 'dog', label: 'Perro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Otro' },
];

/** Etiqueta de edad derivada (calculada en la API). */
function ageLabel(age?: ComputedAge): string {
  if (!age) return 'Edad desconocida';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} a`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '0 m';
  return age.approximate ? `~${text}` : text;
}

/** `/animales` — expediente de animales (RF07, S2-04A). Crear/editar/eliminar:
 *  Owner/Administrator/Operator/Veterinarian escriben (eliminar es más
 *  estricto: solo Owner/Administrator, ver `DELETE_ROLES` en el backend);
 *  ver: + ReadOnlyAuditor. Listado como vista principal (grid de cards),
 *  registro/edición en modal — ningún dato de la lista requiere un endpoint
 *  nuevo salvo `DELETE /animals/:id` (S2-04A §3.4). */
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

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Animal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [sponsorshipTarget, setSponsorshipTarget] = useState<Animal | null>(null);

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

  function openCreateModal(): void {
    setEditingAnimal(null);
    setModalOpen(true);
  }

  function openEditModal(animal: Animal): void {
    setEditingAnimal(animal);
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
      <PageHeader title="Animales" description="Gestión de animales de tu organización." />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
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
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-48"
              >
                {SPECIES_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              {canBulkImport && (
                <Button
                  variant="outline"
                  onClick={() => setBulkImportOpen(true)}
                  className="gap-1.5"
                >
                  <UploadIcon /> Importar Excel
                </Button>
              )}
              {canManage && (
                <Button onClick={openCreateModal} className="gap-1.5">
                  <PlusIcon /> Registrar animal
                </Button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<PawEmptyIcon />}
              title={
                animals.length === 0
                  ? 'Registra tu primer animal para empezar'
                  : 'Ningún animal coincide con la búsqueda'
              }
              action={
                animals.length === 0 && canManage ? (
                  <Button onClick={openCreateModal} className="gap-1.5">
                    <PlusIcon /> Registrar tu primer animal
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((animal) => {
                const isInactive = animal.isActive === false;
                return (
                  <Card key={animal.id} className="overflow-hidden">
                    <Link to={`/animales/${animal.id}`} className="block">
                      <div className="aspect-[4/3] w-full bg-muted">
                        {animal.photos[0] ? (
                          <img
                            src={animal.photos[0]}
                            alt={animal.name}
                            className={cn('h-full w-full object-cover', isInactive && 'opacity-60')}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <PawEmptyIcon className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <CardContent className="space-y-1.5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground hover:underline">
                            {animal.name}
                          </span>
                          {isInactive && <Badge variant="destructive">Inactivo</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
                          {animal.breed && <Badge variant="outline">{animal.breed}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {ageLabel(animal.computedAge)} · {SEX_LABELS[animal.sex]}
                        </p>
                        {animal.tags && animal.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {animal.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] text-secondary-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Link>
                    {canManage && (
                      <div className="space-y-1 border-t p-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1"
                            onClick={() => openEditModal(animal)}
                          >
                            <PencilIcon /> Editar
                          </Button>
                          <Link
                            to={`/animales/${animal.id}`}
                            className={cn(
                              buttonVariants({ variant: 'outline', size: 'sm' }),
                              'flex-1 gap-1',
                            )}
                          >
                            <FolderIcon /> Expediente
                          </Link>
                          {!isInactive && canDelete && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => setDeleteTarget(animal)}
                              aria-label={`Eliminar ${animal.name}`}
                            >
                              <TrashIcon />
                            </Button>
                          )}
                        </div>
                        {!isInactive && canManageSponsorship && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1"
                            onClick={() => setSponsorshipTarget(animal)}
                          >
                            <HeartIcon /> Apadrinamiento
                          </Button>
                        )}
                        {isInactive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => void reactivate(animal)}
                          >
                            Reactivar
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AnimalFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        animal={editingAnimal}
        onSaved={() => void load()}
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
