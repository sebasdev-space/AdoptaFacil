import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import {
  Badge,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { fetchPublicAnimals } from '../api/public-animals';
import {
  buildAdoptionRequestHref,
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
} from '../model/animals-catalog';

// Cap del endpoint público (§RF07). En deep-link buscamos el animal dentro del
// catálogo (no hay GET público de un animal individual y NO se crean endpoints).
const CATALOG_CAP = 50;

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type DetailState = 'loading' | 'ready' | 'not-found' | 'error';

interface AnimalNavState {
  animal?: AnimalSummary;
}

/**
 * Detalle PÚBLICO de un animal adoptable en el portal `/o/:slug/animales/:animalId`
 * (§M14/M03). Sin autenticación y con SOLO campos públicos de `AnimalSummary` — nunca
 * expediente clínico, recordatorios ni documentos (superficie interna de M03). Al
 * navegar desde una tarjeta el animal llega por nav-state (sin refetch); en deep-link
 * se resuelve buscándolo en el catálogo público de la organización.
 *
 * El botón "Solicitar adopción" enlaza al flujo de T-028a (Persona autenticada). La
 * ruta destino está bajo `RequireAuth`: sin sesión, returnTo a login y regreso al
 * animal (deny-by-default); con sesión, entra directo.
 *
 * F-LANDING-02: un animal se alcanza tanto desde el portal general (`/`, F-LANDING-01)
 * como desde el portal de su organización (`/o/:slug`) — por eso ofrece DOS salidas:
 * "Volver al inicio" (siempre disponible, no depende de ningún fetch) y "Ver
 * {nombre real}" hacia `/o/:slug` (fetch independiente y best-effort, igual que el
 * conteo de animales de `OrgPublicPage`; nunca un texto genérico — si el nombre no
 * carga, ese segundo enlace simplemente no aparece, "Volver al inicio" sigue ahí).
 */
export function PublicAnimalDetailPage() {
  const { slug, animalId } = useParams<{ slug: string; animalId: string }>();
  const location = useLocation();
  const preloaded = (location.state as AnimalNavState | null)?.animal;

  const [animal, setAnimal] = useState<AnimalSummary | null>(preloaded ?? null);
  const [state, setState] = useState<DetailState>(preloaded ? 'ready' : 'loading');
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (preloaded || !slug || !animalId) {
      if (!slug || !animalId) setState('not-found');
      return;
    }
    let active = true;
    fetchPublicAnimals({ slug, limit: CATALOG_CAP, offset: 0 })
      .then((page) => {
        if (!active) return;
        const found = page.items.find((a) => a.id === animalId) ?? null;
        setAnimal(found);
        setState(found ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [preloaded, slug, animalId]);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetch(`${API_BASE}/public/organizations/${encodeURIComponent(slug)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ name?: string }>) : null))
      .then((body) => {
        if (active && body?.name) setOrgName(body.name);
      })
      .catch(() => {
        // Best-effort: "Ver {org}" simply stays absent; "Volver al inicio" remains.
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Volver al inicio
        </Link>
        {slug && orgName && (
          <Link
            to={`/o/${encodeURIComponent(slug)}`}
            className="text-sm text-primary hover:underline"
          >
            Ver {orgName}
          </Link>
        )}
      </div>

      <div className="mt-4">
        {state === 'loading' && <Skeleton className="h-72 w-full" />}
        {state === 'not-found' && (
          <EmptyState
            title="Animal no encontrado"
            description="Este animal ya no está disponible para adopción o el enlace no es válido."
          />
        )}
        {state === 'error' && (
          <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
        )}
        {state === 'ready' && animal && (
          <Card className="overflow-hidden" data-testid="public-animal-detail">
            {animal.photoUrl ? (
              <img
                src={animal.photoUrl}
                alt={animal.name}
                className="max-h-96 w-full object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-56 w-full items-center justify-center bg-muted text-sm text-muted-foreground"
              >
                Sin foto
              </div>
            )}
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {animal.name}
                <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
                {animal.breed && <Badge variant="outline">{animal.breed}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Sexo</dt>
                  <dd className="text-sm">{SEX_LABELS[animal.sex]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Tamaño</dt>
                  <dd className="text-sm">{SIZE_LABELS[animal.size]}</dd>
                </div>
                {animal.computedAge && (
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Edad aproximada</dt>
                    <dd className="text-sm">{animal.computedAge.totalMonths} meses</dd>
                  </div>
                )}
              </dl>

              <div className="flex flex-col items-start gap-1">
                <Link
                  to={buildAdoptionRequestHref(animal.organizationId, animal)}
                  className={cn(buttonVariants())}
                  data-testid="request-adoption-cta"
                >
                  Solicitar adopción
                </Link>
                <p className="text-xs text-muted-foreground">
                  Necesitarás iniciar sesión como persona para enviar tu solicitud.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
