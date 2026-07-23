import { useEffect, useState } from 'react';
import {
  type Animal,
  type AnimalSpecies,
  type ComputedAge,
  type CreateAnimalInput,
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

const SPECIES_LABELS: Record<AnimalSpecies, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otro',
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

/** `/animales` — expediente de animales (RF07). Crear/editar/activar:
 *  Owner/Administrator/Operator/Veterinarian; ver: + ReadOnlyAuditor. */
export function AnimalsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage =
    hasRole(Role.Owner) ||
    hasRole(Role.Administrator) ||
    hasRole(Role.Operator) ||
    hasRole(Role.Veterinarian);
  const { toast } = useToast();

  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<AnimalSpecies>('dog');
  const [birthDate, setBirthDate] = useState('');
  const [photo, setPhoto] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    const items = await client.request<Animal[]>('/animals?includeInactive=true');
    setAnimals(items);
    setLoading(false);
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

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast({ title: 'Nombre requerido', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const body: CreateAnimalInput = {
        name: name.trim(),
        species,
        sex: 'unknown',
        size: 'medium',
        ...(birthDate ? { birthDate: new Date(birthDate).toISOString() } : {}),
        ...(photo.trim() ? { photos: [{ filename: photo.trim() }] } : {}),
      };
      await client.request<Animal>('/animals', { method: 'POST', json: body });
      setName('');
      setBirthDate('');
      setPhoto('');
      await load();
      toast({ title: 'Expediente creado' });
    } catch (error) {
      toast({
        title: 'No se pudo crear el expediente',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (animal: Animal): Promise<void> => {
    const action = animal.isActive ? 'deactivate' : 'activate';
    try {
      await client.request<Animal>(`/animals/${animal.id}/${action}`, { method: 'POST' });
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Animales"
        description="Expediente de animales de tu organización (RF07)."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Nuevo expediente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <select
                  aria-label="Especie"
                  value={species}
                  onChange={(e) => setSpecies(e.target.value as AnimalSpecies)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(Object.keys(SPECIES_LABELS) as AnimalSpecies[]).map((s) => (
                    <option key={s} value={s}>
                      {SPECIES_LABELS[s]}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  aria-label="Fecha de nacimiento (opcional)"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
                <Input
                  placeholder="Foto (nombre de archivo)"
                  value={photo}
                  onChange={(e) => setPhoto(e.target.value)}
                />
                <Button disabled={saving} onClick={() => void submit()}>
                  Crear expediente
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Expedientes</CardTitle>
            </CardHeader>
            <CardContent>
              {animals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay animales.</p>
              ) : (
                <ul className="space-y-3">
                  {animals.map((animal) => (
                    <li key={animal.id} className="border-b pb-2 text-sm last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{animal.name}</span>
                        <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
                        <Badge>{animal.status}</Badge>
                        {animal.isActive === false && <Badge variant="destructive">Inactivo</Badge>}
                        <span className="text-muted-foreground">
                          {ageLabel(animal.computedAge)}
                        </span>
                        {animal.breed && (
                          <span className="text-muted-foreground">· {animal.breed}</span>
                        )}
                      </div>
                      {canManage && (
                        <Button
                          variant="outline"
                          className="mt-2"
                          onClick={() => void toggle(animal)}
                        >
                          {animal.isActive === false ? 'Reactivar' : 'Desactivar'}
                        </Button>
                      )}
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
