import { useEffect, useState } from 'react';
import { ANIMAL_SPECIES, type AnimalSpecies, type AnimalSummary } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { fetchPublicAnimals } from '../api/public-animals';
import { AnimalCard } from './animal-card';
import { SPECIES_LABELS } from '../model/animals-catalog';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-pets';

type SpeciesFilter = AnimalSpecies | 'all';
type SectionState = 'loading' | 'ready' | 'error';

export interface PortalAdoptionSectionProps {
  slug: string;
}

/**
 * Sección "Mascotas en adopción" del portal público (§M14/M03, RF07). Consume el
 * catálogo público adoptable de la organización y muestra tarjetas con foto (solo
 * campos públicos, nada clínico). Respeta el filtro por especie y la paginación
 * ("cargar más") con los params REALES del endpoint (species/limit/offset, cap 50).
 * La respuesta viene envuelta; `fetchPublicAnimals` ya normaliza `.items` a `[]`, así
 * que nunca se hace `.map` sobre un no-array (blindaje T-028c). Estado vacío explícito.
 */
export function PortalAdoptionSection({ slug }: PortalAdoptionSectionProps) {
  const [items, setItems] = useState<AnimalSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [species, setSpecies] = useState<SpeciesFilter>('all');
  const [state, setState] = useState<SectionState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  // (Re)carga desde el offset 0 al cambiar el slug o el filtro de especie.
  useEffect(() => {
    let active = true;
    setState('loading');
    fetchPublicAnimals({
      slug,
      species: species === 'all' ? undefined : species,
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setTotal(page.total);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [slug, species]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPublicAnimals({
        slug,
        species: species === 'all' ? undefined : species,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch {
      // Conserva lo ya cargado; el usuario puede reintentar.
    } finally {
      setLoadingMore(false);
    }
  };

  const filters: readonly SpeciesFilter[] = ['all', ...ANIMAL_SPECIES];

  return (
    <section aria-labelledby={HEADING_ID} data-testid="portal-adoption-section">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle id={HEADING_ID}>Mascotas en adopción</CardTitle>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especie">
            {filters.map((f) => (
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
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <Skeleton className="h-40 w-full" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin animales en adopción"
              description="Esta organización no tiene animales en adopción ahora."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            <>
              {/* Grid compacto (pulido visual 2da iteración): 1 columna en
                  mobile (<768px), 2 en tablet (768–1279px), 4 en desktop
                  (≥1280px) — mismos breakpoints Tailwind md/xl. */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {items.map((animal) => (
                  <AnimalCard key={animal.id} slug={slug} animal={animal} />
                ))}
              </div>
              {items.length < total && (
                <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
