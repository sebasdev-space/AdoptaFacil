import { useEffect, useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { Animal, AnimalSex, AnimalStatus, ComputedAge } from '@adoptafacil/contracts';
import styles from './animal-id-card.module.scss';

const STATUS_LABELS: Record<AnimalStatus, string> = {
  available: 'En adopción',
  in_process: 'En proceso',
  adopted: 'Adoptado',
  unavailable: 'No disponible',
  deceased: 'Fallecido',
};

const SEX_LABELS: Record<AnimalSex, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sexo desconocido',
};

/** "3 años 2 meses" / "~5 meses"; `undefined` si la edad no se conoce. */
function ageText(age?: ComputedAge): string | undefined {
  if (!age) return undefined;
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} ${age.years === 1 ? 'año' : 'años'}`);
  if (age.months > 0) parts.push(`${age.months} ${age.months === 1 ? 'mes' : 'meses'}`);
  const text = parts.join(' ') || '0 meses';
  return age.approximate ? `~${text}` : text;
}

/** Huella (almohadilla + 4 dedos), decorativa. */
function Paw({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="currentColor">
      <ellipse cx="24" cy="31" rx="11" ry="9" />
      <ellipse cx="9" cy="21" rx="4.6" ry="6" />
      <ellipse cx="19" cy="12" rx="4.6" ry="6.4" />
      <ellipse cx="29" cy="12" rx="4.6" ry="6.4" />
      <ellipse cx="39" cy="21" rx="4.6" ry="6" />
    </svg>
  );
}

function Heart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 21C4 14.5 2 11 2 7.8 2 5.2 4 3.5 6.4 3.5c2.2 0 4.4 1.3 5.6 3.5 1.2-2.2 3.4-3.5 5.6-3.5C20 3.5 22 5.2 22 7.8 22 11 20 14.5 12 21Z" />
    </svg>
  );
}

function Logo({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <span className={`${styles.logo} ${tone === 'dark' ? styles['logo--dark'] : ''}`}>
      <span className={styles.logo__mark}>
        <Heart className={styles.logo__heart} />
      </span>
      <span className={styles.logo__word}>
        Adopta<span className={styles.logo__accent}>Fácil</span>
      </span>
    </span>
  );
}

function SexSymbol({ sex }: { sex: AnimalSex }) {
  return (
    <svg viewBox="0 0 16 16" className={styles.sex} aria-hidden fill="none" stroke="currentColor">
      {sex === 'male' && (
        <>
          <circle cx="6.5" cy="9.5" r="4" strokeWidth="1.4" />
          <path d="M9.5 6.5 14 2m-4 0h4v4" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {sex === 'female' && (
        <>
          <circle cx="8" cy="6" r="4" strokeWidth="1.4" />
          <path d="M8 10v5m-2.5-2.5h5" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {sex === 'unknown' && <circle cx="8" cy="8" r="4" strokeWidth="1.4" />}
    </svg>
  );
}

/** Código de barras CODE128 como SVG (barras reales, escaneables). */
function Barcode({ value }: { value: string }) {
  const bits = useMemo(() => {
    const target: { encodings?: Array<{ data: string }> } = {};
    try {
      JsBarcode(target, value, { format: 'CODE128', displayValue: false });
    } catch {
      return '';
    }
    return target.encodings?.map((e) => e.data).join('') ?? '';
  }, [value]);
  if (!bits) return null;

  const bars: Array<{ x: number; w: number }> = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      bars.push({ x: i, w: j - i });
      i = j;
    } else {
      i++;
    }
  }
  return (
    <svg
      viewBox={`0 0 ${bits.length} 28`}
      preserveAspectRatio="none"
      className={styles.barcode}
      role="img"
      aria-label={`Código de barras ${value}`}
    >
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.w} height={28} fill="#0f0f14" />
      ))}
    </svg>
  );
}

/** QR a partir de `value`, generado en el navegador (mismo enlace que el PDF). */
function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    try {
      QRCode.toDataURL(value, { margin: 0, width: 220, errorCorrectionLevel: 'M' })
        .then((url) => {
          if (active) setSrc(url);
        })
        .catch(() => undefined);
    } catch {
      // Valor no codificable: se queda el marcador, la tarjeta no se rompe.
    }
    return () => {
      active = false;
    };
  }, [value]);
  if (!src) return <span aria-hidden className={styles.qr__placeholder} />;
  return <img src={src} alt="Código QR del perfil del animal" className={styles.qr__img} />;
}

type InfoIcon = 'calendar' | 'paw' | 'heart' | 'house';

function InfoIconSvg({ kind }: { kind: InfoIcon }) {
  if (kind === 'paw') return <Paw className={styles.info__svg} />;
  if (kind === 'heart') return <Heart className={styles.info__svg} />;
  if (kind === 'house') {
    return (
      <svg viewBox="0 0 24 24" className={styles.info__svg} aria-hidden fill="currentColor">
        <path d="M3 12 12 4l9 8h-2.5v8h-13v-8Z" />
        <rect x="10" y="14" width="4" height="6" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={styles.info__svg} aria-hidden fill="currentColor">
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <rect x="6" y="9" width="12" height="9" fill="#fff" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="11" width="2.4" height="2.4" />
      <rect x="11" y="11" width="2.4" height="2.4" />
      <rect x="14" y="11" width="2.4" height="2.4" />
      <rect x="8" y="14.4" width="2.4" height="2.4" />
    </svg>
  );
}

export interface AnimalIdCardProps {
  animal: Animal;
  /** Código "N°" derivado del id (`GET .../card`). */
  code: string;
  /** URL del perfil público que codifica el QR (`GET .../card`). */
  profileUrl: string;
}

/**
 * Carnet de identificación del animal (frente y reverso), con el mismo diseño y
 * los mismos datos que la hoja 1 del PDF "Descargar carnet". Solo muestra lo que
 * el animal realmente tiene: sin raza/edad/rasgos, esas filas simplemente no
 * aparecen (nunca se inventan).
 */
export function AnimalIdCard({ animal, code, profileUrl }: AnimalIdCardProps) {
  const photo = animal.photos[0];
  const status = STATUS_LABELS[animal.status];
  const age = ageText(animal.computedAge);
  const traits = animal.tags ?? [];

  const rows: Array<{ icon: InfoIcon; label: string; value: string }> = [];
  if (age) rows.push({ icon: 'calendar', label: 'Edad', value: age });
  if (animal.breed) rows.push({ icon: 'paw', label: 'Raza', value: animal.breed });
  rows.push({ icon: 'heart', label: 'Estado', value: status });
  if (traits.length > 0) rows.push({ icon: 'house', label: 'Carácter', value: traits.join(', ') });

  return (
    <div className={styles.cards} data-testid="animal-id-card">
      {/* FRENTE */}
      <article
        className={`${styles.card} ${styles.front}`}
        aria-label={`Carnet de ${animal.name}, frente`}
      >
        <div className={styles.front__blobA} aria-hidden />
        <div className={styles.front__blobB} aria-hidden />
        <Paw className={`${styles.deco} ${styles.front__pawTop}`} />
        <Paw className={`${styles.deco} ${styles.front__pawLeft}`} />
        <Paw className={`${styles.deco} ${styles.front__pawRight}`} />

        <div className={styles.front__logo}>
          <Logo tone="light" />
        </div>

        <div className={styles.photo}>
          {photo ? (
            <img src={photo} alt={`Foto de ${animal.name}`} className={styles.photo__img} />
          ) : (
            <span className={styles.photo__fallback} aria-hidden>
              <Paw className={styles.photo__paw} />
            </span>
          )}
          <span className={styles.photo__badge} aria-hidden>
            <Paw className={styles.photo__badgePaw} />
          </span>
        </div>

        <h3 className={styles.name}>{animal.name}</h3>
        <div className={styles.pill}>
          <span className={styles.pill__item}>
            <SexSymbol sex={animal.sex} />
            {SEX_LABELS[animal.sex]}
          </span>
          {animal.breed && (
            <>
              <span className={styles.pill__divider} aria-hidden />
              <span className={`${styles.pill__item} ${styles['pill__item--breed']}`}>
                {animal.breed}
              </span>
            </>
          )}
        </div>
        <p className={styles.status}>{status}</p>

        <div className={styles.front__band}>
          <p className={styles.band__label}>ID Animal</p>
          <div className={styles.band__barcode}>
            <Barcode value={code} />
          </div>
          <p className={styles.band__code}>N° {code}</p>
        </div>
      </article>

      {/* REVERSO */}
      <article
        className={`${styles.card} ${styles.back}`}
        aria-label={`Carnet de ${animal.name}, reverso`}
      >
        <div className={styles.back__head}>
          <Paw className={`${styles.deco} ${styles.back__paw}`} />
          <div className={styles.qr}>
            <Qr value={profileUrl} />
          </div>
          <p className={styles.back__title}>Conoce su historia</p>
          <p className={styles.back__hint}>
            Escanea este código para ver
            <br />
            su perfil en AdoptaFácil
          </p>
        </div>

        <ul className={styles.info}>
          {rows.map((row) => (
            <li key={row.label} className={styles.info__row}>
              <span className={styles.info__icon}>
                <InfoIconSvg kind={row.icon} />
              </span>
              <span className={styles.info__text}>
                <span className={styles.info__label}>{row.label}</span>
                <span className={styles.info__value}>{row.value}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.back__foot}>
          <Logo tone="dark" />
          <span className={styles.foot__divider} aria-hidden />
          <span className={styles.foot__tagline}>
            Adopta
            <br />
            Dona
            <br />
            Sé parte del cambio
          </span>
        </div>
      </article>
    </div>
  );
}
