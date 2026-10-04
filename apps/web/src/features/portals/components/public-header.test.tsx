import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicHeader } from './public-header';

/**
 * El menú del portal resalta la sección que el visitante está viendo (antes
 * "Animales" estaba fijo como activo sin importar el scroll).
 */
const ORG = { id: 'org-1', name: 'CatCompany' };
const NAV = [
  { label: 'Inicio', href: '#portal-top' },
  { label: 'Animales', href: '#portal-section-pets' },
  { label: 'Reseñas', href: '#portal-reviews' },
  { label: 'Transparencia', href: '#portal-section-public-ledger' },
  { label: 'Contacto', href: '#portal-contact-info' },
];

/** Crea los destinos de las anclas, con el `top` que se le indique. */
function mountSections(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    const el = document.createElement('div');
    el.id = id;
    el.getBoundingClientRect = () => ({ top }) as DOMRect;
    document.body.appendChild(el);
  }
}

function scrollTo(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    const el = document.getElementById(id);
    if (el) el.getBoundingClientRect = () => ({ top }) as DOMRect;
  }
  act(() => {
    fireEvent.scroll(window);
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PublicHeader — resaltado de la sección actual', () => {
  it('"Inicio" está activo arriba del todo, no "Animales"', () => {
    mountSections({ 'portal-top': 0, 'portal-section-pets': 600, 'portal-reviews': 1400 });
    render(<PublicHeader organization={ORG} navItems={NAV} />);

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', { name: 'Animales' })).not.toHaveAttribute('aria-current');
  });

  it('sigue al visitante al hacer scroll entre secciones', async () => {
    mountSections({ 'portal-top': 0, 'portal-section-pets': 600, 'portal-reviews': 1400 });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0; // ya se ejecutó: no queda un frame pendiente
    });
    render(<PublicHeader organization={ORG} navItems={NAV} />);

    scrollTo({ 'portal-top': -500, 'portal-section-pets': 100, 'portal-reviews': 900 });
    expect(screen.getByRole('link', { name: 'Animales' })).toHaveAttribute(
      'aria-current',
      'location',
    );

    scrollTo({ 'portal-top': -1500, 'portal-section-pets': -800, 'portal-reviews': 60 });
    expect(screen.getByRole('link', { name: 'Reseñas' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', { name: 'Animales' })).not.toHaveAttribute('aria-current');
  });

  it('al hacer clic en una pestaña se marca de inmediato', () => {
    mountSections({ 'portal-top': 0, 'portal-section-pets': 600, 'portal-reviews': 1400 });
    render(<PublicHeader organization={ORG} navItems={NAV} />);

    fireEvent.click(screen.getByRole('link', { name: 'Reseñas' }));
    expect(screen.getByRole('link', { name: 'Reseñas' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('clic en "Transparencia" con "Contacto" debajo: la página llega al fondo y NO salta a "Contacto"', () => {
    const tops = {
      'portal-top': -3000,
      'portal-section-pets': -2200,
      'portal-reviews': -900,
      // Transparencia no alcanza la línea de referencia (la página ya no da más scroll)…
      'portal-section-public-ledger': 380,
      // …y Contacto, debajo, también está a la vista.
      'portal-contact-info': 640,
    };
    mountSections(tops);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    // La página está en el fondo.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: window.innerHeight + 5000,
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 5000 });
    render(<PublicHeader organization={ORG} navItems={NAV} />);

    fireEvent.click(screen.getByRole('link', { name: 'Transparencia' }));
    scrollTo(tops); // scroll programático del ancla: no debe cambiar la pestaña
    expect(screen.getByRole('link', { name: 'Transparencia' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', { name: 'Contacto' })).not.toHaveAttribute('aria-current');

    // Si el visitante sigue desplazándose él mismo, el bloqueo se libera y se mantiene
    // la pestaña actual mientras su sección siga a la vista.
    act(() => {
      fireEvent.wheel(window);
    });
    scrollTo(tops);
    expect(screen.getByRole('link', { name: 'Transparencia' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });
});
