import { cn } from '@adoptafacil/ui';
import styles from './hero-photo-grid.module.scss';

/**
 * Collage decorativo del hero — NO son datos reales ni vienen del catálogo
 * (ese es `GeneralCatalogSection`, cableado a `/public/animals`). Son parte
 * del diseño de la landing: 4 cuadros con degradé de marca + un ícono de
 * mascota, con entrada escalonada y hover sutil (ambos respetan
 * `prefers-reduced-motion` vía el guard global de `packages/ui`).
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
  return (
    <div className={styles.grid} role="img" aria-label="Mascotas en adopción">
      {BOXES.map(({ variant, height, Icon }, index) => (
        <div key={index} className={cn(styles.box, variant, height)}>
          <Icon className={styles.box__icon} />
        </div>
      ))}
    </div>
  );
}
