import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type Animal,
  type AnimalBreed,
  type AnimalSex,
  type AnimalSize,
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
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/animal-form-fields';
import { PHOTO_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';

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

const SIZE_LABELS: Record<AnimalSize, string> = {
  small: 'Pequeño',
  medium: 'Mediano',
  large: 'Grande',
};

const SPECIES_OPTIONS = (Object.keys(SPECIES_LABELS) as AnimalSpecies[]).map((value) => ({
  value,
  label: SPECIES_LABELS[value],
}));
const SEX_OPTIONS = (Object.keys(SEX_LABELS) as AnimalSex[]).map((value) => ({
  value,
  label: SEX_LABELS[value],
}));
const SIZE_OPTIONS = (Object.keys(SIZE_LABELS) as AnimalSize[]).map((value) => ({
  value,
  label: SIZE_LABELS[value],
}));

/** Sentinel breed-select value meaning "free-text custom breed" (T-D04) — never
 *  sent to the backend, only used to toggle the custom-breed text input. */
const CUSTOM_BREED_VALUE = '__custom__';

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
 *  Owner/Administrator/Operator/Veterinarian; ver: + ReadOnlyAuditor.
 *
 *  Pulido UX (T-D04): expone todos los campos que `POST /animals` ya acepta
 *  (raza vía catálogo o personalizada, sexo, tamaño, descripción — antes
 *  hardcodeados a `sex: 'unknown'` / `size: 'medium'` y ocultos del formulario),
 *  agrupa el formulario en un `Card`, y el listado pasa de una lista plana a un
 *  grid de tarjetas. Ningún endpoint cambia. */
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
  const [breeds, setBreeds] = useState<AnimalBreed[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<AnimalSpecies>('dog');
  const [breedSelection, setBreedSelection] = useState<string>('');
  const [customBreed, setCustomBreed] = useState('');
  const [sex, setSex] = useState<AnimalSex>('unknown');
  const [size, setSize] = useState<AnimalSize>('medium');
  const [birthDate, setBirthDate] = useState('');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  // Breed catalog is tenant + species scoped (T-104); reload whenever the
  // selected species changes and drop a stale selection from the previous list.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await client.request<AnimalBreed[]>(
          `/animals/breeds?species=${encodeURIComponent(species)}`,
        );
        if (active) setBreeds(items);
      } catch {
        if (active) setBreeds([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, species]);

  useEffect(() => {
    setBreedSelection('');
    setCustomBreed('');
  }, [species]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast({ title: 'Nombre requerido', variant: 'warning' });
      return;
    }
    if (photoFile) {
      const invalid = validateUpload(photoFile);
      if (invalid) {
        toast({ title: 'Imagen no válida', description: invalid, variant: 'warning' });
        return;
      }
    }
    setSaving(true);
    try {
      const breedFields: Pick<CreateAnimalInput, 'breedId' | 'customBreed'> =
        breedSelection === CUSTOM_BREED_VALUE
          ? customBreed.trim()
            ? { customBreed: customBreed.trim() }
            : {}
          : breedSelection
            ? { breedId: breedSelection }
            : {};
      const body: CreateAnimalInput = {
        name: name.trim(),
        species,
        sex,
        size,
        ...breedFields,
        ...(birthDate ? { birthDate: new Date(birthDate).toISOString() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(photoFile ? { photos: [{ filename: photoFile.name }] } : {}),
      };
      // 1) Create the record (reserves a public storage key per photo, T-104).
      const created = await client.request<Animal>('/animals', { method: 'POST', json: body });
      // 2) Send the real photo bytes to the reserved key (T-108).
      const key = created.photoRecords?.[0]?.storageRef;
      if (photoFile && key) {
        await uploadFileBytes(client, key, photoFile);
      }
      setName('');
      setBreedSelection('');
      setCustomBreed('');
      setSex('unknown');
      setSize('medium');
      setBirthDate('');
      setDescription('');
      setPhotoFile(null);
      await load();
      toast({ title: 'Expediente creado', variant: 'success' });
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

  const breedOptions = [
    { value: '', label: breeds.length ? 'Selecciona una raza…' : 'Sin razas registradas' },
    ...breeds.map((breed) => ({ value: breed.id, label: breed.name })),
    { value: CUSTOM_BREED_VALUE, label: 'Otra / Personalizada' },
  ];

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
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="animal-name"
                      className="block text-sm font-medium text-foreground"
                    >
                      Nombre
                    </label>
                    <Input
                      id="animal-name"
                      placeholder="Nombre del animal"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <SelectField
                    id="animal-species"
                    label="Especie"
                    value={species}
                    onChange={setSpecies}
                    options={SPECIES_OPTIONS}
                  />
                  <SelectField
                    id="animal-breed"
                    label="Raza"
                    value={breedSelection}
                    onChange={setBreedSelection}
                    options={breedOptions}
                  />
                  {breedSelection === CUSTOM_BREED_VALUE && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="animal-custom-breed"
                        className="block text-sm font-medium text-foreground"
                      >
                        Raza personalizada
                      </label>
                      <Input
                        id="animal-custom-breed"
                        placeholder="Escribe la raza"
                        value={customBreed}
                        onChange={(e) => setCustomBreed(e.target.value)}
                      />
                    </div>
                  )}
                  <SelectField
                    id="animal-sex"
                    label="Sexo"
                    value={sex}
                    onChange={setSex}
                    options={SEX_OPTIONS}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="animal-birthdate"
                      className="block text-sm font-medium text-foreground"
                    >
                      Fecha de nacimiento (aproximada)
                    </label>
                    <Input
                      id="animal-birthdate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </div>
                  <SelectField
                    id="animal-size"
                    label="Tamaño"
                    value={size}
                    onChange={setSize}
                    options={SIZE_OPTIONS}
                  />
                </div>

                <TextAreaField
                  id="animal-description"
                  label="Descripción"
                  value={description}
                  onChange={setDescription}
                  placeholder="Cuéntanos sobre la personalidad y la historia de este animal…"
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="animal-photo"
                    className="block text-sm font-medium text-foreground"
                  >
                    Foto principal (imagen, máx. 15 MB)
                  </label>
                  <div className="flex items-center gap-3">
                    {photoPreviewUrl && (
                      <img
                        src={photoPreviewUrl}
                        alt="Previsualización"
                        className="h-16 w-16 rounded-md border border-border object-cover"
                      />
                    )}
                    <input
                      id="animal-photo"
                      type="file"
                      accept={PHOTO_ACCEPT.join(',')}
                      onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
                    />
                  </div>
                </div>

                <Button disabled={saving} onClick={() => void submit()}>
                  {saving ? 'Creando…' : 'Crear expediente'}
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
                <EmptyState
                  icon={<span aria-hidden>🐾</span>}
                  title="Registra tu primer animal para empezar"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {animals.map((animal) => (
                    <Card key={animal.id} className="overflow-hidden">
                      <Link to={`/animales/${animal.id}`} className="block">
                        <div className="aspect-[4/3] w-full bg-muted">
                          {animal.photos[0] ? (
                            <img
                              src={animal.photos[0]}
                              alt={animal.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <span aria-hidden className="text-2xl">
                                🐾
                              </span>
                            </div>
                          )}
                        </div>
                        <CardContent className="space-y-1.5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground hover:underline">
                              {animal.name}
                            </span>
                            {animal.isActive === false && (
                              <Badge variant="destructive">Inactivo</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
                            <Badge>{animal.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {animal.breed ? `${animal.breed} · ` : ''}
                            {ageLabel(animal.computedAge)} · {SEX_LABELS[animal.sex]}
                          </p>
                        </CardContent>
                      </Link>
                      {canManage && (
                        <div className="border-t px-3 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => void toggle(animal)}
                          >
                            {animal.isActive === false ? 'Reactivar' : 'Desactivar'}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
