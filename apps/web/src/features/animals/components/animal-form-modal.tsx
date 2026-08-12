import { useEffect, useState } from 'react';
import {
  type Animal,
  type AnimalBreed,
  type AnimalPhotoUploadResult,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  type CreateAnimalInput,
  type UpdateAnimalInput,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { SelectField, TextAreaField } from './animal-form-fields';
import { BreedCombobox } from './breed-combobox';
import { TagInput } from './tag-input';
import { AnimalPhotoField } from './animal-photo-field';
import { MissingSlugBanner } from './missing-slug-banner';
import { PHOTO_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';

const SPECIES_OPTIONS: { value: AnimalSpecies; label: string }[] = [
  { value: 'dog', label: 'Perro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Otro' },
];
const SEX_OPTIONS: { value: AnimalSex; label: string }[] = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Hembra' },
  { value: 'unknown', label: 'Desconocido' },
];
const SIZE_OPTIONS: { value: AnimalSize; label: string }[] = [
  { value: 'small', label: 'Pequeño' },
  { value: 'medium', label: 'Mediano' },
  { value: 'large', label: 'Grande' },
];

/** Client-side estimate for the live "≈ X años y Y meses" hint next to the
 *  date picker (S2-04A §5.5) — the AUTHORITATIVE `computedAge` shown on cards
 *  still comes from the API (`Animal.computedAge`); this is just UX feedback
 *  while the modal is open. */
function estimateAgeLabel(birthDateInput: string): string | null {
  if (!birthDateInput) return null;
  const birth = new Date(birthDateInput);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} año${years === 1 ? '' : 's'}`);
  if (remMonths > 0) parts.push(`${remMonths} mes${remMonths === 1 ? '' : 'es'}`);
  return parts.length ? `≈ ${parts.join(' y ')}` : '≈ menos de 1 mes';
}

function toDateInputValue(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export interface AnimalFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = create; otherwise edit this record. */
  animal: Animal | null;
  onSaved: () => void;
  /** El padre (`AnimalsPage`) ya sabe si la organización tiene `slug`
   *  configurado (`GET /org/profile`, un solo fetch compartido) — se repite
   *  aquí el mismo aviso persistente para que sea visible justo en el
   *  momento de registrar/editar, no solo en la lista de atrás. */
  showMissingSlugWarning?: boolean;
}

export function AnimalFormModal({
  open,
  onOpenChange,
  animal,
  onSaved,
  showMissingSlugWarning,
}: AnimalFormModalProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const isEdit = animal !== null;

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<AnimalSpecies>('dog');
  const [breedId, setBreedId] = useState('');
  const [customBreed, setCustomBreed] = useState('');
  const [sex, setSex] = useState<AnimalSex>('unknown');
  const [size, setSize] = useState<AnimalSize>('medium');
  const [birthDate, setBirthDate] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [breeds, setBreeds] = useState<AnimalBreed[]>([]);
  const [saving, setSaving] = useState(false);

  // Photo: CREATE defers the real upload to submit-time (no animal id yet, same
  // as this page always did) — `photoFile` + a local blob preview. EDIT uploads
  // immediately (the animal already exists), so `photoPreviewUrl` there is the
  // real resolved URL and `photoFile` stays unused.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [currentPhotoRecordId, setCurrentPhotoRecordId] = useState<string | null>(null);

  // Reset/prefill whenever the modal opens for a given animal (or a fresh create).
  useEffect(() => {
    if (!open) return;
    setPhotoFile(null);
    if (animal) {
      setName(animal.name);
      setSpecies(animal.species);
      setBreedId(animal.breedId ?? '');
      setCustomBreed(animal.breedId ? '' : (animal.customBreed ?? ''));
      setSex(animal.sex);
      setSize(animal.size);
      setBirthDate(toDateInputValue(animal.birthDate));
      setDescription(animal.description ?? '');
      setTags(animal.tags ?? []);
      setPhotoPreviewUrl(animal.photos[0] ?? null);
      setCurrentPhotoRecordId(animal.photoRecords?.[0]?.id ?? null);
    } else {
      setName('');
      setSpecies('dog');
      setBreedId('');
      setCustomBreed('');
      setSex('unknown');
      setSize('medium');
      setBirthDate('');
      setDescription('');
      setTags([]);
      setPhotoPreviewUrl(null);
      setCurrentPhotoRecordId(null);
    }
  }, [open, animal]);

  // Breed catalog is tenant + species scoped (T-104); reload on species change.
  useEffect(() => {
    if (!open) return;
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
  }, [client, species, open]);

  // CREATE preview: local blob URL for the picked file.
  useEffect(() => {
    if (isEdit || !photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile, isEdit]);

  function handleSpeciesChange(next: AnimalSpecies): void {
    setSpecies(next);
    setBreedId('');
    setCustomBreed('');
  }

  async function handlePhotoSelected(file: File): Promise<void> {
    const invalid = validateUpload(file, PHOTO_ACCEPT);
    if (invalid) {
      toast({ title: 'Imagen no válida', description: invalid, variant: 'warning' });
      return;
    }
    if (!isEdit || !animal) {
      setPhotoFile(file);
      return;
    }
    // Edit mode: the animal already exists, so upload right away (mirrors the
    // org logo/cover pattern) and replace the previous primary photo, if any.
    setPhotoUploading(true);
    try {
      const result = await client.request<AnimalPhotoUploadResult>(`/animals/${animal.id}/photos`, {
        method: 'POST',
        json: { filename: file.name, contentType: file.type, order: 0 },
      });
      await uploadFileBytes(client, result.upload.key, file);
      if (currentPhotoRecordId) {
        await client.request(`/animals/${animal.id}/photos/${currentPhotoRecordId}`, {
          method: 'DELETE',
        });
      }
      setPhotoPreviewUrl(result.photo.url);
      setCurrentPhotoRecordId(result.photo.id);
      toast({ title: 'Foto actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo subir la foto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) {
      toast({ title: 'Nombre requerido', variant: 'warning' });
      return;
    }
    if (photoFile) {
      const invalid = validateUpload(photoFile, PHOTO_ACCEPT);
      if (invalid) {
        toast({ title: 'Imagen no válida', description: invalid, variant: 'warning' });
        return;
      }
    }
    setSaving(true);
    try {
      const breedFields = breedId
        ? { breedId }
        : customBreed.trim()
          ? { customBreed: customBreed.trim() }
          : {};
      if (isEdit && animal) {
        const body: UpdateAnimalInput = {
          name: name.trim(),
          species,
          sex,
          size,
          ...breedFields,
          ...(birthDate ? { birthDate: new Date(birthDate).toISOString() } : {}),
          description: description.trim() || undefined,
          tags,
        };
        await client.request<Animal>(`/animals/${animal.id}`, { method: 'PATCH', json: body });
        toast({ title: 'Expediente actualizado', variant: 'success' });
      } else {
        const body: CreateAnimalInput = {
          name: name.trim(),
          species,
          sex,
          size,
          ...breedFields,
          ...(birthDate ? { birthDate: new Date(birthDate).toISOString() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          tags,
          ...(photoFile
            ? { photos: [{ filename: photoFile.name, contentType: photoFile.type }] }
            : {}),
        };
        const created = await client.request<Animal>('/animals', { method: 'POST', json: body });
        const key = created.photoRecords?.[0]?.storageRef;
        if (photoFile && key) {
          await uploadFileBytes(client, key, photoFile);
        }
        toast({ title: 'Expediente creado', variant: 'success' });
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: isEdit ? 'No se pudo actualizar el expediente' : 'No se pudo crear el expediente',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const ageHint = estimateAgeLabel(birthDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * Layout notes (M03 modal redesign): the base `.dialog-content` (packages/ui,
       * NOT modified here) is a `display:grid` box with its own padding/gap — that's
       * exactly what makes the 3-row split below work with zero extra wrapper divs:
       * DialogHeader / the scrollable body / DialogFooter are its 3 direct grid
       * children, sized via `grid-rows-[auto_1fr_auto]` so the MIDDLE row alone
       * absorbs any overflow (`min-h-0` is required for a grid item to shrink below
       * its content size — without it the scroll area never actually scrolls).
       * Header and footer stay outside that scroll area, so they're always visible
       * (no more scrollbar rendered on top of the whole card, cutting across
       * "Especie" like before) and the footer's Cancelar/Registrar buttons never
       * require scrolling to reach.
       */}
      {/*
       * `maxWidth`/`width` are set via inline `style`, not a Tailwind className:
       * the base `.dialog-content` (packages/ui) sets `max-width: 32rem` in its
       * own SCSS module, and empirically (measured via a real render) a Tailwind
       * utility class on this consumer does NOT win that cascade — inline style
       * always does, without touching the shared component's source.
       */}
      <DialogContent
        className="grid-rows-[auto_1fr_auto] overflow-hidden"
        style={{ maxWidth: '56rem', width: 'calc(100% - 2rem)', maxHeight: '85vh' }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar animal' : 'Registrar animal'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualiza los datos del expediente.'
              : 'Completa los datos para crear un nuevo expediente.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {showMissingSlugWarning && <MissingSlugBanner />}

          {/* Foto principal al costado (arriba, alineada con el grid de campos
           *  cortos) en desktop; apilada antes del grid en tablet/mobile. */}
          <div className="grid gap-4 lg:grid-cols-[176px_1fr] lg:gap-6">
            <AnimalPhotoField
              id="animal-photo"
              preview={photoPreviewUrl}
              uploading={photoUploading}
              onFileSelected={(file) => void handlePhotoSelected(file)}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="animal-name" className="block text-sm font-medium text-foreground">
                  Nombre *
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
                label="Especie *"
                value={species}
                onChange={handleSpeciesChange}
                options={SPECIES_OPTIONS}
              />
              <BreedCombobox
                id="animal-breed"
                label="Raza"
                breeds={breeds}
                value={breedId}
                onSelectBreed={setBreedId}
                customValue={customBreed}
                onCustomValueChange={setCustomBreed}
              />
              <SelectField
                id="animal-sex"
                label="Sexo"
                value={sex}
                onChange={setSex}
                options={SEX_OPTIONS}
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="animal-birthdate"
                  className="block text-sm font-medium text-foreground"
                >
                  Fecha de nacimiento
                </label>
                <Input
                  id="animal-birthdate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
                {ageHint && <p className="text-xs text-muted-foreground">{ageHint}</p>}
              </div>
              <SelectField
                id="animal-size"
                label="Tamaño"
                value={size}
                onChange={setSize}
                options={SIZE_OPTIONS}
              />
            </div>
          </div>

          <TextAreaField
            id="animal-description"
            label="Descripción"
            value={description}
            onChange={setDescription}
            placeholder="Cuéntanos sobre la personalidad y la historia de este animal…"
          />

          <TagInput
            id="animal-tags"
            label="Etiquetas de personalidad"
            tags={tags}
            onChange={setTags}
          />
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar animal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
