import { useEffect, useMemo, useState } from 'react';
import {
  ANIMAL_SPECIES,
  type AnimalSpecies,
  type PublicAnimalSummary,
} from '@adoptafacil/contracts';
import {
  Button,
  ComingSoon,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
} from '@adoptafacil/ui';
import { SPECIES_LABELS } from '../../portals/model/animals-catalog';
import { fetchGlobalPublicAnimals } from '../api/public-animals';
import { CatalogAnimalCard } from './catalog-animal-card';
import { AnimalDetailModal } from './animal-detail-modal';

/** Tope real del endpoint público (`public-animals.service.ts`, backend) — no
 *  se puede pedir más por página aunque se mande un `limit` mayor. */
const CATALOG_CAP = 50;
/** Exported so the hero's "Ver mascotas en adopción" CTA can anchor-scroll here. */
export const GENERAL_CATALOG_HEADING_ID = 'general-catalog-heading';

type SpeciesFilter = AnimalSpecies | 'all';
type SectionState = 'loading' | 'ready' | 'error';

interface CityFacet {
  city: string;
  count: number;
}

/** Coincide si el texto de búsqueda aparece en nombre/raza/organización/ciudad
 *  del animal — "cualquier dato" real del propio animal, nunca un campo
 *  inventado. Insensible a mayúsculas/acentos básicos (solo minúsculas, sin
 *  normalización de tildes: suficiente para el caso de uso, no se agrega una
 *  librería nueva por esto). */
function matchesQuery(animal: PublicAnimalSummary, query: string): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [animal.name, animal.breed, animal.organization.name, animal.organization.city];
  return haystacks.some((field) => field?.toLowerCase().includes(needle));
}

/**
 * Catálogo CONSOLIDADO de animales adoptables de TODAS las organizaciones
 * (F-LANDING-01, M14, RF25) — `GET /public/animals` (S1-07).
 *
 * Pulido visual (2da ronda): filtrado en tiempo real, sin pedir de nuevo al
 * backend por cada tecla/click. Se carga UNA sola vez el catálogo completo
 * (tope real del servidor: 50 animales) y especie/ciudad/texto libre se
 * filtran en el navegador — instantáneo, sin debounce necesario (no hay
 * fetch de por medio). Límite conocido y documentado: si el total real
 * (`total`) supera 50, esta vista solo ve/filtra esos primeros 50 — se
 * avisa explícitamente en pantalla en vez de aparentar cubrir todo el
 * catálogo. El backend no expone un parámetro de búsqueda libre ni un
 * endpoint de conteos por ciudad (`public-animals.schemas.ts` solo acepta
 * species/city/page/limit) — el filtro por ciudad y sus contadores se
 * calculan aquí, sobre datos reales ya cargados, nunca inventados.
 */
export function GeneralCatalogSection() {
  const [items, setItems] = useState<PublicAnimalSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<SectionState>('loading');

  const [species, setSpecies] = useState<SpeciesFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());

  const [selectedAnimal, setSelectedAnimal] = useState<PublicAnimalSummary | null>(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setState('loading');
    fetchGlobalPublicAnimals({ limit: CATALOG_CAP, page: 1 })
      .then((result) => {
        if (!active) return;
        setItems(result.data);
        setTotal(result.total);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const cityFacets: CityFacet[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const animal of items) {
      const city = animal.organization.city;
      if (!city) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter(
        (animal) =>
          (species === 'all' || animal.species === species) &&
          (selectedCities.size === 0 ||
            (animal.organization.city && selectedCities.has(animal.organization.city))) &&
          matchesQuery(animal, query),
      ),
    [items, species, selectedCities, query],
  );

  // Filtrar en vivo no significa renderizar las 50 tarjetas de una vez (QA
  // visual: en mobile eso deja un scroll larguísimo). "Ver más" solo revela
  // más del set YA cargado/filtrado — no vuelve a pedir nada al backend.
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [species, selectedCities, query]);
  const visibleItems = filteredItems.slice(0, visibleCount);

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  };

  const hasActiveFilters = species !== 'all' || selectedCities.size > 0 || query.trim() !== '';
  const clearAllFilters = () => {
    setSpecies('all');
    setSelectedCities(new Set());
    setQuery('');
  };

  const speciesFilters: readonly SpeciesFilter[] = ['all', ...ANIMAL_SPECIES];
  const incompleteCatalog = total > CATALOG_CAP;

  return (
    <section aria-labelledby={GENERAL_CATALOG_HEADING_ID} data-testid="general-catalog">
      <div className="space-y-1">
        <h2 id={GENERAL_CATALOG_HEADING_ID} className="text-2xl font-bold tracking-tight">
          Animales en adopción
        </h2>
        {state === 'ready' && (
          <p className="text-sm text-muted-foreground">
            {filteredItems.length === items.length
              ? `${items.length} ${items.length === 1 ? 'animal' : 'animales'}`
              : `${filteredItems.length} de ${items.length} animales`}
            {incompleteCatalog && ' · mostrando los primeros 50, ajusta los filtros para acotar'}
          </p>
        )}
      </div>

      {/* Chips de filtros activos (pulido visual): cada uno se puede quitar
          individualmente, o todos con "Limpiar" — mismos datos reales de
          arriba, ninguno nuevo. */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {species !== 'all' && (
            <button
              type="button"
              data-testid="active-filter-chip-species"
              onClick={() => setSpecies('all')}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium"
            >
              {SPECIES_LABELS[species]} <span aria-hidden>×</span>
            </button>
          )}
          {Array.from(selectedCities).map((city) => (
            <button
              key={city}
              type="button"
              data-testid={`active-filter-chip-city-${city}`}
              onClick={() => toggleCity(city)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium"
            >
              {city} <span aria-hidden>×</span>
            </button>
          ))}
          {query.trim() !== '' && (
            <button
              type="button"
              data-testid="active-filter-chip-query"
              onClick={() => setQuery('')}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium"
            >
              "{query.trim()}" <span aria-hidden>×</span>
            </button>
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Limpiar
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Filtros (pulido visual): agrupados por ciudad con conteo real, en
            vez del input de texto + botón "Buscar" de antes. */}
        <aside className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Especie
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especie">
              {speciesFilters.map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant={species === f ? undefined : 'outline'}
                  aria-pressed={species === f}
                  onClick={() => setSpecies(f)}
                >
                  {f === 'all' ? 'Todas' : SPECIES_LABELS[f]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Buscar
            </h3>
            <Input
              aria-label="Buscar por nombre, raza, ciudad u organización"
              placeholder="Nombre, raza, ciudad…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {cityFacets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ciudad
              </h3>
              <div className="space-y-1.5">
                {cityFacets.map(({ city, count }) => (
                  <label key={city} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedCities.has(city)}
                      onChange={() => toggleCity(city)}
                      className="accent-primary"
                    />
                    {city}
                    <span className="ml-auto text-xs text-muted-foreground">{count}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="space-y-4">
          {state === 'loading' && <Skeleton className="h-40 w-full" />}

          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}

          {state === 'ready' && filteredItems.length === 0 && (
            <EmptyState
              title="No hay animales en adopción ahora"
              description="Vuelve a intentarlo más tarde o ajusta los filtros."
            />
          )}

          {state === 'ready' && filteredItems.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((animal) => (
                  <CatalogAnimalCard
                    key={animal.id}
                    animal={animal}
                    onOpenDetail={setSelectedAnimal}
                  />
                ))}
                {/* "¿No encuentras tu amigo?" solo al final del todo, para no
                    interrumpir el "Ver más" con una tarjeta que no es un animal. */}
                {visibleCount >= filteredItems.length && (
                  <NoMatchCard onClick={() => setAlertModalOpen(true)} />
                )}
              </div>
              {visibleCount < filteredItems.length && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    Ver más
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AnimalDetailModal
        animal={selectedAnimal}
        onOpenChange={(open) => !open && setSelectedAnimal(null)}
      />

      <Dialog open={alertModalOpen} onOpenChange={setAlertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear alerta</DialogTitle>
          </DialogHeader>
          <ComingSoon
            icon={<span aria-hidden>🔔</span>}
            title="Disponible próximamente"
            description="Avisarte cuando llegue un animal con las características que buscas todavía no está conectado."
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** "¿No encuentras tu nuevo amigo?" — última tarjeta del grid (pulido
 *  visual, imagen de referencia usada solo como guía). Al hacer clic abre el
 *  modal "Disponible próximamente" ya usado en el resto del sistema — no
 *  crea ninguna alerta real todavía. */
function NoMatchCard({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-lg"
      >
        +
      </span>
      <p className="text-sm font-medium">¿No encuentras tu nuevo amigo?</p>
      <p className="text-xs text-muted-foreground">
        Te avisamos cuando llegue un animal con estas características.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        Crear alerta
      </Button>
    </div>
  );
}
