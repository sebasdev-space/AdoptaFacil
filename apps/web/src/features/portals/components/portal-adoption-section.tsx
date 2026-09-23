import { useEffect, useMemo, useState } from 'react';
import {
  ANIMAL_SEXES,
  ANIMAL_SIZES,
  ANIMAL_SPECIES,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  type AnimalSummary,
  type OrganizationPublic,
} from '@adoptafacil/contracts';
import { EmptyState, Input, cn } from '@adoptafacil/ui';
import { fetchPublicAnimals } from '../api/public-animals';
import { AnimalCard } from './animal-card';
import {
  AGE_BUCKET_LABELS,
  CATALOG_SORT_LABELS,
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
  ageBucket,
  matchesSearch,
  sortAnimals,
  type AgeBucket,
  type CatalogSort,
} from '../model/animals-catalog';
import styles from '../styles/public-catalog.module.scss';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-pets';

type Filter<T extends string> = T | 'all';
type SectionState = 'loading' | 'ready' | 'error';

export interface PortalAdoptionSectionProps {
  slug: string;
  /** Para el botón "Donar" de cada tarjeta (`buildDonateHref` es por
   *  organización, no por animal). Sin este prop, la tarjeta omite ese botón. */
  organization?: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
}

function SkeletonGrid() {
  return (
    <div className={styles.grid} aria-hidden data-testid="catalog-skeleton">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={cn(styles.skeletonPhoto, styles.shimmer)} />
          <div className={cn(styles.skeletonLine, styles.shimmer)} />
          <div className={cn(styles.skeletonLine, styles.shimmer)} />
        </div>
      ))}
    </div>
  );
}

/**
 * Sección "Mascotas en adopción" del portal público (§M14/M03, RF07,
 * rediseño T-D03). Consume el catálogo público adoptable de la organización
 * (solo campos públicos, nada clínico) y ofrece filtros/orden/búsqueda EN
 * TIEMPO REAL, resueltos en el cliente sobre el conjunto ya cargado.
 *
 * El endpoint solo soporta `species` como filtro real
 * (`fetchPublicAnimals` — ver su doc comment); por eso "Cargar más" siempre
 * pide el pool SIN filtrar (mismo endpoint, sin params extra) y TODOS los
 * filtros (incluida especie) se aplican aquí — instantáneo, sin round-trip,
 * y sin inventar params que el backend no entiende (rechazo explícito de
 * "no inventar lógica de backend").
 */
export function PortalAdoptionSection({ slug, organization }: PortalAdoptionSectionProps) {
  const [rawItems, setRawItems] = useState<AnimalSummary[]>([]);
  const [rawTotal, setRawTotal] = useState(0);
  const [state, setState] = useState<SectionState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  const [species, setSpecies] = useState<Filter<AnimalSpecies>>('all');
  const [sex, setSex] = useState<Filter<AnimalSex>>('all');
  const [size, setSize] = useState<Filter<AnimalSize>>('all');
  const [age, setAge] = useState<Filter<AgeBucket>>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CatalogSort>('recent');

  // Un único fetch (sin `species`) al cambiar de organización — los filtros
  // ya no re-consultan el backend, ver doc comment de arriba.
  useEffect(() => {
    let active = true;
    setState('loading');
    fetchPublicAnimals({ slug, limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (!active) return;
        setRawItems(page.items);
        setRawTotal(page.total);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPublicAnimals({ slug, limit: PAGE_SIZE, offset: rawItems.length });
      setRawItems((prev) => [...prev, ...page.items]);
      setRawTotal(page.total);
    } catch {
      // Conserva lo ya cargado; el usuario puede reintentar.
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredItems = useMemo(() => {
    const filtered = rawItems.filter((animal) => {
      if (species !== 'all' && animal.species !== species) return false;
      if (sex !== 'all' && animal.sex !== sex) return false;
      if (size !== 'all' && animal.size !== size) return false;
      if (age !== 'all' && ageBucket(animal.computedAge) !== age) return false;
      if (!matchesSearch(animal, search)) return false;
      return true;
    });
    return sortAnimals(filtered, sort);
  }, [rawItems, species, sex, size, age, search, sort]);

  const hasActiveFilters =
    species !== 'all' || sex !== 'all' || size !== 'all' || age !== 'all' || search.trim() !== '';

  const clearFilters = () => {
    setSpecies('all');
    setSex('all');
    setSize('all');
    setAge('all');
    setSearch('');
  };

  const speciesFilters: readonly Filter<AnimalSpecies>[] = ['all', ...ANIMAL_SPECIES];

  return (
    <section aria-labelledby={HEADING_ID} data-testid="portal-adoption-section">
      <div className="mb-4 flex flex-col gap-1">
        <h2 id={HEADING_ID} className={styles.heading}>
          Mascotas en adopción
        </h2>
        {state === 'ready' && (
          <p className={styles.counter}>
            <span className={styles.counter__value}>{filteredItems.length}</span>
            {' de '}
            <span className={styles.counter__value}>{rawTotal}</span> animales
          </p>
        )}
      </div>

      <div className={cn(styles.toolbar, 'mb-5')}>
        <div className={styles.search}>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={cn(styles.search__icon, 'h-4 w-4')}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <Input
            type="search"
            className={styles.search__input}
            placeholder="Buscar por nombre o raza…"
            aria-label="Buscar por nombre o raza"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={styles.pills} role="group" aria-label="Filtrar por especie">
          {speciesFilters.map((f) => (
            <button
              key={f}
              type="button"
              className={cn(styles.pill, species === f && styles['pill--active'])}
              aria-pressed={species === f}
              onClick={() => setSpecies(f)}
            >
              {f === 'all' ? 'Todas' : SPECIES_LABELS[f]}
            </button>
          ))}
        </div>

        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            aria-label="Filtrar por sexo"
            value={sex}
            onChange={(event) => setSex(event.target.value as Filter<AnimalSex>)}
          >
            <option value="all">Sexo: todos</option>
            {ANIMAL_SEXES.map((s) => (
              <option key={s} value={s}>
                {SEX_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            aria-label="Filtrar por tamaño"
            value={size}
            onChange={(event) => setSize(event.target.value as Filter<AnimalSize>)}
          >
            <option value="all">Tamaño: todos</option>
            {ANIMAL_SIZES.map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            aria-label="Filtrar por edad"
            value={age}
            onChange={(event) => setAge(event.target.value as Filter<AgeBucket>)}
          >
            <option value="all">Edad: todas</option>
            {(Object.keys(AGE_BUCKET_LABELS) as AgeBucket[]).map((bucket) => (
              <option key={bucket} value={bucket}>
                {AGE_BUCKET_LABELS[bucket]}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            aria-label="Ordenar por"
            value={sort}
            onChange={(event) => setSort(event.target.value as CatalogSort)}
          >
            {(Object.keys(CATALOG_SORT_LABELS) as CatalogSort[]).map((s) => (
              <option key={s} value={s}>
                {CATALOG_SORT_LABELS[s]}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button type="button" className={styles.clearFilters} onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {state === 'loading' && <SkeletonGrid />}
      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}
      {state === 'ready' && rawItems.length === 0 && (
        <EmptyState
          title="Sin animales en adopción"
          description="Esta organización no tiene animales en adopción ahora."
        />
      )}
      {state === 'ready' && rawItems.length > 0 && filteredItems.length === 0 && (
        <EmptyState
          title="Sin resultados"
          description="Ningún animal coincide con los filtros elegidos."
        />
      )}
      {state === 'ready' && filteredItems.length > 0 && (
        <div className="space-y-4">
          <div className={styles.grid}>
            {filteredItems.map((animal) => (
              <AnimalCard key={animal.id} slug={slug} animal={animal} organization={organization} />
            ))}
          </div>
          {rawItems.length < rawTotal && (
            <div className={styles.loadMore}>
              <button
                type="button"
                className={styles.pill}
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
