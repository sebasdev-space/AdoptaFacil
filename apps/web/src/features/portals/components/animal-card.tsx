import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnimalSummary, OrganizationPublic } from '@adoptafacil/contracts';
import { Badge, Button, buttonVariants, cn } from '@adoptafacil/ui';
import {
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
  ageLabel,
  isRecentlyPublished,
  publicAnimalDetailHref,
  buildAdoptionRequestHref,
  buildSponsorHref,
} from '../model/animals-catalog';
import { buildDonateHref } from './portal-donate-cta';
import { IconGift, IconHeart, IconHome } from './portal-icons';
import styles from '../styles/public-catalog.module.scss';

export interface AnimalCardProps {
  slug: string;
  animal: AnimalSummary;
  /**
   * Organización dueña del animal — solo para construir el enlace "Donar"
   * (`buildDonateHref`, la donación es POR ORGANIZACIÓN, no por animal). Sin
   * este prop la tarjeta simplemente omite ese botón (nunca inventa un enlace
   * incompleto).
   */
  organization?: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
  /**
   * Cuando se pasa, un clic normal (botón izquierdo, sin teclas modificadoras)
   * NO navega — llama a esto en su lugar (pulido visual: el catálogo general
   * lo usa para abrir un modal en vez de ir a la página de detalle completa).
   * El `href` real se conserva siempre: clic derecho/central/Ctrl+clic
   * (abrir en pestaña nueva) siguen funcionando como un link normal. Sin
   * este prop, el comportamiento es EXACTAMENTE el de siempre (navegación).
   */
  onOpenDetail?: (animal: AnimalSummary) => void;
}

/** Silueta simple (huella), usada como fallback cuando el animal no tiene foto. */
function PawPlaceholder() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor">
      <circle cx="7" cy="8" r="2.2" />
      <circle cx="12" cy="5.5" r="2.2" />
      <circle cx="17" cy="8" r="2.2" />
      <path d="M12 12c-3.5 0-6.5 2.3-6.5 5.2 0 2 1.7 2.8 3.3 2 1-.5 2-1 3.2-1s2.2.5 3.2 1c1.6.8 3.3 0 3.3-2 0-2.9-3-5.2-6.5-5.2Z" />
    </svg>
  );
}

/**
 * Tarjeta pública de un animal adoptable (§M14/M03, rediseño "marketplace"
 * T-D03). Solo campos PÚBLICOS de `AnimalSummary` (foto, nombre, especie,
 * raza, edad, sexo, tamaño, fecha de publicación) — nada clínico. El detalle
 * individual (`/o/:slug/animales/:animalId`, T-052) YA existe y está
 * cableado — se conserva el enlace tal cual (nav-state con el `AnimalSummary`,
 * para que el detalle no vuelva a pedir la lista).
 *
 * El corazón de "favorito" es SOLO del navegador (estado local del
 * componente, nunca persistido): no existe ninguna funcionalidad de
 * favoritos en el backend (ni tabla, ni endpoint). Se implementa así — en
 * vez de omitirlo — para no dejar el diseño del mockup incompleto, pero
 * deliberadamente NO se guarda en ningún lado: se pierde al recargar la
 * página. TODO(client): si el negocio pide favoritos reales, esto necesita
 * un endpoint propio (probablemente atado a la cuenta del visitante).
 */
export function AnimalCard({ slug, animal, organization, onOpenDetail }: AnimalCardProps) {
  const age = ageLabel(animal.computedAge);
  const isNew = isRecentlyPublished(animal.createdAt);
  const detailHref = publicAnimalDetailHref(slug, animal.id);
  // La foto pública puede apuntar a un storage-ref roto/expirado (StoragePort
  // stub en Ola 1) — si `<img>` falla, cae al mismo placeholder que "sin foto",
  // en vez de dejar un hueco de color sólido sin ícono.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(animal.photoUrl) && !photoFailed;
  const [favorited, setFavorited] = useState(false);

  return (
    <article className={styles.card} data-testid="animal-card">
      <Link
        to={detailHref}
        state={{ animal }}
        aria-label={`Ver detalle de ${animal.name}`}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          if (!onOpenDetail) return;
          const isPlainLeftClick =
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey;
          if (!isPlainLeftClick) return; // deja abrir en pestaña nueva/etc. como un link real
          event.preventDefault();
          onOpenDetail(animal);
        }}
      >
        <div className={styles.card__photoWrap}>
          {showPhoto ? (
            <img
              src={animal.photoUrl}
              alt={animal.name}
              className={styles.card__photo}
              loading="lazy"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <div
              aria-hidden
              className={styles.card__placeholder}
              style={{ color: 'hsl(var(--muted-foreground) / 0.5)' }}
            >
              <PawPlaceholder />
            </div>
          )}
          {isNew && (
            <span className={styles.card__badgeNew} data-testid="animal-card-new-badge">
              Nuevo
            </span>
          )}
        </div>

        <div className={styles.card__body}>
          <p className={styles.card__name}>{animal.name}</p>
          <div className={styles.card__meta}>
            {animal.breed && <span>{animal.breed}</span>}
            {animal.breed && age && <span aria-hidden>·</span>}
            {age && <span>{age}</span>}
          </div>
          <div className={styles.card__badges}>
            <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
            <Badge variant="outline">{SEX_LABELS[animal.sex]}</Badge>
            <Badge variant="outline">{SIZE_LABELS[animal.size]}</Badge>
          </div>
        </div>
      </Link>

      <button
        type="button"
        className={styles.card__favorite}
        aria-pressed={favorited}
        aria-label={
          favorited ? `Quitar ${animal.name} de favoritos` : `Guardar ${animal.name} en favoritos`
        }
        onClick={() => setFavorited((prev) => !prev)}
      >
        <IconHeart className="h-4 w-4" filled={favorited} />
      </button>

      <div className={styles.card__actions}>
        <Link
          to={buildAdoptionRequestHref(animal.organizationId, animal)}
          className={cn(buttonVariants({ size: 'sm' }), styles.card__actionPrimary)}
        >
          <IconHome className="mr-1.5 h-4 w-4" />
          Adoptar
        </Link>
        <Link
          to={buildSponsorHref(animal, organization?.name)}
          className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
        >
          <IconHeart className="mr-1.5 h-4 w-4" />
          Apadrinar
        </Link>
        {organization ? (
          <Link
            to={buildDonateHref(organization)}
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
          >
            <IconGift className="mr-1.5 h-4 w-4" />
            Donar
          </Link>
        ) : (
          <Button size="sm" variant="outline" disabled>
            <IconGift className="mr-1.5 h-4 w-4" />
            Donar
          </Button>
        )}
      </div>
    </article>
  );
}
