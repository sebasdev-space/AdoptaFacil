import type { AnimalSex, AnimalSize, AnimalSpecies, AnimalSummary } from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) de los campos PÚBLICOS del animal. */
export const SPECIES_LABELS: Record<AnimalSpecies, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otro',
};

export const SEX_LABELS: Record<AnimalSex, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin especificar',
};

export const SIZE_LABELS: Record<AnimalSize, string> = {
  small: 'Pequeño',
  medium: 'Mediano',
  large: 'Grande',
};

/**
 * Enlace al flujo de SOLICITUD de adopción de T-028a (seam que dejó tipado la
 * "navegación pública del adoptante"). La página `/adopciones/solicitar`
 * (`useAdoptionTarget`) espera EXACTAMENTE estos query params: organizationId,
 * animalId, name, species y (opcional) photoUrl. No se reimplementa su lógica; solo
 * se enlaza. La ruta está bajo `RequireAuth` → sin sesión, returnTo a login y regreso
 * al flujo con el animal preservado.
 */
export function buildAdoptionRequestHref(
  organizationId: string,
  animal: Pick<AnimalSummary, 'id' | 'name' | 'species' | 'photoUrl'>,
): string {
  const params = new URLSearchParams({
    organizationId,
    animalId: animal.id,
    name: animal.name,
    species: animal.species,
  });
  if (animal.photoUrl) {
    params.set('photoUrl', animal.photoUrl);
  }
  return `/adopciones/solicitar?${params.toString()}`;
}

/** Enlace al detalle PÚBLICO del animal dentro del portal de la organización. */
export function publicAnimalDetailHref(slug: string, animalId: string): string {
  return `/o/${encodeURIComponent(slug)}/animales/${encodeURIComponent(animalId)}`;
}
