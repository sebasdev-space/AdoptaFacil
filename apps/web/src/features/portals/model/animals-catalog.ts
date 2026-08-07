import type {
  AnimalSex,
  AnimalSize,
  AnimalSpecies,
  AnimalSummary,
  ComputedAge,
} from '@adoptafacil/contracts';

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

/** Etiqueta legible de la edad DERIVADA (calculada en la API, T-104) — nunca una
 *  fecha de nacimiento cruda. Ausente cuando la organización no la registró. */
export function ageLabel(age?: ComputedAge): string | undefined {
  if (!age) return undefined;
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} ${age.years === 1 ? 'año' : 'años'}`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '< 1 mes';
  return age.approximate ? `~${text}` : text;
}

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

/**
 * Enlace al flujo de APADRINAMIENTO (M07/RF17, S2-03 — dominio de Sebastián). La
 * página `/apadrinar` (`useSponsorTarget`) espera EXACTAMENTE animalId y, opcional,
 * animalName/organizationName (solo presentación; no organizationId — el backend
 * resuelve la org desde el animal). No se reimplementa su lógica; solo se enlaza.
 * La ruta está bajo `RequireAuth` → sin sesión, returnTo a login y regreso al flujo
 * con el animal preservado (mismo mecanismo que `buildAdoptionRequestHref`).
 */
export function buildSponsorHref(
  animal: Pick<AnimalSummary, 'id' | 'name'>,
  organizationName?: string,
): string {
  const params = new URLSearchParams({ animalId: animal.id, animalName: animal.name });
  if (organizationName) {
    params.set('organizationName', organizationName);
  }
  return `/apadrinar?${params.toString()}`;
}

/** Enlace al detalle PÚBLICO del animal dentro del portal de la organización. */
export function publicAnimalDetailHref(slug: string, animalId: string): string {
  return `/o/${encodeURIComponent(slug)}/animales/${encodeURIComponent(animalId)}`;
}
