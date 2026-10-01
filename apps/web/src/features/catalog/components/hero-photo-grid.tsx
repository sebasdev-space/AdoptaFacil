import { useEffect, useState } from 'react';
import type { PublicPortalBannerPhoto } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { fetchPortalBanner } from '../api/public-portal-banner';
import styles from './hero-photo-grid.module.scss';

/**
 * Collage del hero. Las fotos las administra la plataforma
 * (`GET /public/portal-banner`, hasta 4). Mientras carga, si falla o si no hay
 * fotos configuradas, se muestra el FALLBACK de diseño: 4 cuadros con degradé de
 * marca + ícono. Si hay menos de 4 fotos, los cuadros restantes usan el fallback.
 * Entrada escalonada y hover sutil respetan `prefers-reduced-motion` (guard global
 * de `packages/ui`).
 */
const PawIcon = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className}>
    <ellipse cx="12" cy="17" rx="5" ry="4" />
    <circle cx="5" cy="9" r="2.4" />
    <circle cx="10.5" cy="5.5" r="2.2" />
    <circle cx="15.5" cy="5.5" r="2.2" />
    <circle cx="19" cy="9" r="2.4" />
  </svg>
);

const HeartIcon = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
    className={props.className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21s-7-4.35-9.5-8.8C.7 8.7 2.2 5 5.8 5c2 0 3.3 1.1 4.2 2.4C10.9 6.1 12.2 5 14.2 5c3.6 0 5.1 3.7 3.3 7.2C19 16.65 12 21 12 21z"
    />
  </svg>
);

const BOXES = [
  { variant: styles['box--a'], height: 'h-44 mt-6', Icon: PawIcon },
  { variant: styles['box--b'], height: 'h-56', Icon: HeartIcon },
  { variant: styles['box--c'], height: 'h-56', Icon: PawIcon },
  { variant: styles['box--d'], height: 'h-44 mt-6', Icon: HeartIcon },
];

export function HeroPhotoGrid() {
  const [photos, setPhotos] = useState<PublicPortalBannerPhoto[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPortalBanner(controller.signal)
      .then(setPhotos)
      .catch(() => {
        // Fallback silencioso: el hero decorativo sigue funcionando sin fotos.
      });
    return () => controller.abort();
  }, []);

  const hasPhotos = photos.length > 0;

  return (
    <div
      className={styles.grid}
      {...(hasPhotos ? {} : { role: 'img', 'aria-label': 'Mascotas en adopción' })}
    >
      {BOXES.map(({ variant, height, Icon }, index) => {
        const photo = photos[index];
        if (photo) {
          return (
            <div key={photo.id} className={cn(styles.box, styles['box--photo'], height)}>
              <img src={photo.imageUrl} alt={photo.altText} className={styles.box__img} />
            </div>
          );
        }
        return (
          <div key={`fallback-${index}`} className={cn(styles.box, variant, height)}>
            <Icon className={styles.box__icon} />
          </div>
        );
      })}
    </div>
  );
}
