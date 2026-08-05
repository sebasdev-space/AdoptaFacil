import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  ANIMAL_SPECIES,
  type AnimalSpecies,
  type PublicAnimalSummary,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
} from '@adoptafacil/ui';
import { SPECIES_LABELS } from '../../portals/model/animals-catalog';
import { fetchGlobalPublicAnimals } from '../api/public-animals';
import { CatalogAnimalCard } from './catalog-animal-card';

const PAGE_SIZE = 12;
const HEADING_ID = 'general-catalog-heading';

type SpeciesFilter = AnimalSpecies | 'all';
type SectionState = 'loading' | 'ready' | 'error';

/**
 * Catálogo CONSOLIDADO de animales adoptables de TODAS las organizaciones
 * (F-LANDING-01, M14, RF25) — `GET /public/animals` (S1-07). Filtro por
 * especie (inmediato) y por ciudad (al confirmar); paginación real por
 * página (RNF01, el endpoint es page-based para este pager, no offset-based
 * como el catálogo por organización). La respuesta viene envuelta en
 * `{ data, total, page, limit }`; `fetchGlobalPublicAnimals` ya normaliza
 * `.data` a `[]`, así que nunca se hace `.map` sobre un no-array.
 */
export function GeneralCatalogSection() {
  const [items, setItems] = useState<PublicAnimalSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [species, setSpecies] = useState<SpeciesFilter>('all');
  const [cityInput, setCityInput] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<SectionState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    fetchGlobalPublicAnimals({
      species: species === 'all' ? undefined : species,
      city: city || undefined,
      page,
      limit: PAGE_SIZE,
    })
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
  }, [species, city, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyCity = () => {
    setPage(1);
    setCity(cityInput.trim());
  };

  const onCityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') applyCity();
  };

  const filters: readonly SpeciesFilter[] = ['all', ...ANIMAL_SPECIES];

  return (
    <section aria-labelledby={HEADING_ID} data-testid="general-catalog">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle id={HEADING_ID}>Animales en adopción</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especie">
              {filters.map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant={species === f ? undefined : 'outline'}
                  aria-pressed={species === f}
                  onClick={() => {
                    setSpecies(f);
                    setPage(1);
                  }}
                >
                  {f === 'all' ? 'Todas' : SPECIES_LABELS[f]}
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-1.5">
              <Input
                aria-label="Ciudad"
                placeholder="Ciudad"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={onCityKeyDown}
                className="w-40"
              />
              <Button type="button" variant="outline" onClick={applyCity}>
                Buscar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <Skeleton className="h-40 w-full" />}

          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}

          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="No hay animales en adopción ahora"
              description="Vuelve a intentarlo más tarde o ajusta los filtros."
            />
          )}

          {state === 'ready' && items.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {items.map((animal) => (
                  <CatalogAnimalCard key={animal.id} animal={animal} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
