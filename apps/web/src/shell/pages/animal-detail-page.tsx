import { Link, useParams } from 'react-router-dom';
import { AnimalClinicalPanel } from '../../features/animals';
import { PageContainer, PageHeader } from '../../features/_layout';

/**
 * `/animales/:animalId` — shell-owned detail surface that EMBEDS M03's
 * `AnimalClinicalPanel` (RF08) for the selected animal. The panel is embeddable
 * by `animalId`, not a top-level page, so the shell owns the route/param plumbing
 * and hands the id down; the panel keeps its own role logic (view vs. the
 * Veterinarian-only editing).
 *
 * The list → detail link belongs to M03's `AnimalsPage` (Sebastián's internals,
 * out of bounds here); this route is reachable by URL today and is the seam that
 * list will point at. Access is gated at the route by <RequireRoles>.
 */
export function AnimalDetailPage() {
  const { animalId } = useParams<{ animalId: string }>();

  return (
    <PageContainer>
      <PageHeader
        title="Detalle del animal"
        description="Expediente clínico del animal (RF08). Registrar/editar: solo Veterinario."
      />
      <Link
        to="/animales"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a animales
      </Link>
      {animalId ? (
        <AnimalClinicalPanel animalId={animalId} />
      ) : (
        <p className="text-sm text-muted-foreground">Animal no especificado.</p>
      )}
    </PageContainer>
  );
}
