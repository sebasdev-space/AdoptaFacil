import { useEffect, useRef, useState } from 'react';
import type { PublicReview } from '@adoptafacil/contracts';
import { formatBogota, ratingStars } from '../../reputation/model/reputation-view';
import styles from '../styles/public-reviews.module.scss';

export interface ReviewCarouselProps {
  items: PublicReview[];
}

/** px/segundo — "de forma lenta" (pedido del cliente), nunca brusco. */
const SPEED = 28;

/**
 * Fila de reseñas del portal público (S7-b, pedido del cliente): "uno al lado
 * del otro cuando superen la cantidad... y no haya lugar por que el width de
 * la página no deja, deben empezar a moverse... como si fuera un carrusel...
 * de forma lenta... sin afectar contenedores cercanos ni lógica existente".
 *
 * JS decide SI anima (mide si el contenido cabe, `ResizeObserver` — solo
 * anima cuando de verdad desborda) y controla el movimiento con
 * `requestAnimationFrame` sobre un ref (nunca re-renderiza React por frame).
 * El contenido se duplica una vez para un loop perfectamente continuo
 * (traslada hasta -50% y vuelve a 0, invisible al ojo). Pausa en
 * hover/focus (para poder leer) y respeta `prefers-reduced-motion`
 * (fallback: fila con scroll horizontal nativo, todo el contenido sigue
 * alcanzable). `overflow: hidden` + solo `transform` en el viewport: nunca
 * cambia el alto/ancho del contenedor, así que nunca mueve nada a su
 * alrededor.
 */
export function ReviewCarousel({ items }: ReviewCarouselProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const measure = () => {
      // El track (sin duplicar todavía) mide su ancho natural contra el
      // viewport disponible — si no cabe, se activa el modo carrusel.
      setOverflowing(track.scrollWidth > viewport.clientWidth + 1);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(track);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!overflowing || prefersReducedMotion) return;

    const track = trackRef.current;
    if (!track) return;

    let offset = 0;
    let lastTime: number | null = null;
    let frame: number;

    const step = (time: number) => {
      if (lastTime === null) lastTime = time;
      const deltaSeconds = (time - lastTime) / 1000;
      lastTime = time;

      if (!pausedRef.current) {
        offset += SPEED * deltaSeconds;
        // El contenido está duplicado (dos copias) — al pasar la mitad del
        // ancho total, el reinicio a 0 es indistinguible (mismo contenido).
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0 && offset >= halfWidth) {
          offset -= halfWidth;
        }
        track.style.transform = `translateX(-${offset}px)`;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [overflowing]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  const renderCard = (review: PublicReview, key: string, duplicate: boolean) => (
    <article key={key} className={styles.card} aria-hidden={duplicate || undefined}>
      <p className={styles.card__stars} aria-label={`Calificación: ${review.rating} de 5`}>
        {ratingStars(review.rating)}
      </p>
      {review.comment && <p className={styles.card__comment}>{review.comment}</p>}
      <div className={styles.card__meta}>
        <span>{review.authorName ?? 'Anónimo'}</span>
        <span>{formatBogota(review.createdAt)}</span>
      </div>
    </article>
  );

  // Segunda copia SOLO para el loop continuo del carrusel (misma fila flex,
  // nunca envuelta en un div propio — así `track.scrollWidth` es EXACTAMENTE
  // el doble del contenido real y `halfWidth` arriba cae justo donde debe).
  // `aria-hidden` en la copia: el contenido real ya se anunció una vez.
  const cards = overflowing
    ? [
        ...items.map((review) => renderCard(review, review.id, false)),
        ...items.map((review) => renderCard(review, `${review.id}-dup`, true)),
      ]
    : items.map((review) => renderCard(review, review.id, false));

  return (
    <div
      ref={viewportRef}
      className={`${styles.viewport} ${!overflowing ? styles['viewport--scrollable'] : ''}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div
        ref={trackRef}
        className={`${styles.track} ${!overflowing ? styles['track--static'] : ''}`}
      >
        {cards}
      </div>
    </div>
  );
}
