import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicReview } from '@adoptafacil/contracts';
import { ReviewCarousel } from './review-carousel';

const REVIEW_A: PublicReview = {
  id: 'rev-a',
  rating: 5,
  comment: 'Excelente organización',
  authorName: 'Ana',
  createdAt: '2026-09-29T00:00:00.000Z',
};
const REVIEW_B: PublicReview = {
  id: 'rev-b',
  rating: 3,
  createdAt: '2026-09-20T00:00:00.000Z',
};

/**
 * jsdom no calcula layout real: `scrollWidth`/`clientWidth` son 0 por
 * defecto, así que sin forzarlos el carrusel SIEMPRE mide "cabe" (fila
 * estática). Para probar el modo carrusel real (desborda) se sustituye
 * `ResizeObserver` por un stub controlable desde el test.
 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReviewCarousel (S7-b — fila de reseñas del portal público)', () => {
  it('renders every review once when the content fits (jsdom default: no overflow)', () => {
    render(<ReviewCarousel items={[REVIEW_A, REVIEW_B]} />);

    expect(screen.getAllByText('Excelente organización')).toHaveLength(1);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Anónimo')).toBeInTheDocument();
  });

  it('duplicates the row for a seamless loop ONLY once the content overflows the viewport', () => {
    const { container } = render(<ReviewCarousel items={[REVIEW_A, REVIEW_B]} />);
    const viewport = container.querySelector('[class*="viewport"]') as HTMLElement;
    const track = container.querySelector('[class*="track"]') as HTMLElement;

    // Confirms the static path first: exactly one card per review, no dup yet.
    expect(track.children).toHaveLength(2);

    Object.defineProperty(track, 'scrollWidth', { value: 4000, configurable: true });
    Object.defineProperty(viewport, 'clientWidth', { value: 800, configurable: true });
    act(() => {
      FakeResizeObserver.instances.forEach((observer) => observer.trigger());
    });

    // Now duplicated: 2 originals + 2 aria-hidden copies, all direct siblings
    // in the SAME flex row (never wrapped — that would break the -50% loop math).
    expect(track.children).toHaveLength(4);
    Array.from(track.children).forEach((child) => expect(child.tagName).toBe('ARTICLE'));
    expect(screen.getAllByText('Excelente organización')).toHaveLength(2);
  });

  it('renders nothing when there are no reviews', () => {
    const { container } = render(<ReviewCarousel items={[]} />);
    expect(within(container).queryByRole('article')).not.toBeInTheDocument();
  });
});
