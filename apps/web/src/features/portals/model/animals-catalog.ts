import type {
  AnimalSex,
  AnimalSize,
  AnimalSpecies,
  AnimalStatus,
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

/** `deceased` (M07 hallazgo QA, `POST /animals/:id/register-death`) nunca
 *  aparece realmente aquí — el catálogo público ya filtra por
 *  `is_active=true AND status='available'` (`public_org_adoptable_animals`,
 *  T-029) y un animal fallecido siempre queda `isActive=false`. Se agrega la
 *  etiqueta solo para que este mapa exhaustivo siga compilando. */
export const STATUS_LABELS: Record<AnimalStatus, string> = {
  available: 'Disponible',
  in_process: 'En proceso de adopción',
  adopted: 'Adoptado',
  unavailable: 'No disponible',
  deceased: 'Fallecido',
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

/**
 * Rediseño visual del catálogo público (§M14, filtros/orden en tiempo real).
 * Ninguna de estas funciones inventa lógica de backend: todas operan sobre
 * campos que `AnimalSummary` YA expone (species/sex/size/computedAge/createdAt/
 * name/breed) — el endpoint público solo soporta `species` como filtro real
 * (`fetchPublicAnimals`), así que sexo/tamaño/edad/búsqueda/orden se resuelven
 * aquí, en el cliente, sobre el conjunto ya cargado.
 */

/** Ventana de la insignia "Nuevo": animales publicados en los últimos N días. */
const NEW_BADGE_WINDOW_DAYS = 14;

/** True si `createdAt` (ISO-8601 UTC) cae dentro de la ventana de "Nuevo".
 *  Sin `createdAt` (proyección que no lo expone) nunca se marca como nuevo. */
export function isRecentlyPublished(
  createdAt: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const diffDays = (now.getTime() - created) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= NEW_BADGE_WINDOW_DAYS;
}

export type AgeBucket = 'young' | 'adult' | 'senior';

export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  young: 'Joven (< 1 año)',
  adult: 'Adulto (1–7 años)',
  senior: 'Mayor (7+ años)',
};

/** Clasifica la edad DERIVADA en un rango legible para el filtro (heurística
 *  visual, no un dato del modelo). Ausente cuando la edad misma es ausente. */
export function ageBucket(age?: ComputedAge): AgeBucket | undefined {
  if (!age) return undefined;
  if (age.totalMonths < 12) return 'young';
  if (age.totalMonths < 84) return 'adult';
  return 'senior';
}

/** true si el nombre o la raza del animal contienen `query` (case-insensitive,
 *  acentos tal cual — sin normalización adicional). Cadena vacía = sin filtrar. */
export function matchesSearch(
  animal: Pick<AnimalSummary, 'name' | 'breed'>,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (animal.name.toLowerCase().includes(needle)) return true;
  return animal.breed?.toLowerCase().includes(needle) ?? false;
}

export type CatalogSort = 'recent' | 'oldest' | 'name' | 'age';

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  recent: 'Más recientes',
  oldest: 'Más antiguos',
  name: 'Nombre (A–Z)',
  age: 'Edad (menor a mayor)',
};

/** Ordena una copia de `items` (nunca muta el arreglo recibido). Sin
 *  `createdAt` (proyección que no lo expone) los ítems sin fecha quedan al
 *  final, no se fabrica un orden falso. */
export function sortAnimals(items: readonly AnimalSummary[], sort: CatalogSort): AnimalSummary[] {
  const sorted = [...items];
  switch (sort) {
    case 'recent':
      sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      break;
    case 'oldest':
      sorted.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      break;
    case 'age':
      sorted.sort(
        (a, b) =>
          (a.computedAge?.totalMonths ?? Number.MAX_SAFE_INTEGER) -
          (b.computedAge?.totalMonths ?? Number.MAX_SAFE_INTEGER),
      );
      break;
  }
  return sorted;
}
