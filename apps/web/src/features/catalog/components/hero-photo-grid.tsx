import { cn } from '@adoptafacil/ui';
import styles from './hero-photo-grid.module.scss';

export interface HeroPhotoGridProps {
  /** Fotos reales subidas por el PlatformAdmin (S-15, hasta 4, `GET
   *  /public/hero-banner`) — una por cuadro, en orden. Un cuadro sin foto
   *  (arreglo más corto que 4, o ausente) sigue mostrando el degradé +
   *  ícono decorativo de siempre; nunca una caja rota. */
  photos?: string[];
}

/**
 * Collage del hero — 4 cuadros con degradé de marca + ícono de mascota por
 * defecto (entrada escalonada y hover sutil, ambos respetan
 * `prefers-reduced-motion` vía el guard global de `packages/ui`). Desde S-15,
 * cualquier cuadro con una foto real asignada la muestra en su lugar — el
 * PlatformAdmin las sube en `/plataforma/banner`.
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

export function HeroPhotoGrid({ photos }: HeroPhotoGridProps = {}) {
  return (
    <div className={styles.grid} role="img" aria-label="Mascotas en adopción">
      {BOXES.map(({ variant, height, Icon }, index) => {
        const photo = photos?.[index];
        return (
          <div key={index} className={cn(styles.box, variant, height)}>
            {photo ? (
              <img src={photo} alt="" aria-hidden className={styles.box__photo} />
            ) : (
              <Icon className={styles.box__icon} />
            )}
          </div>
        );
      })}
    </div>
  );
}
