import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroPhotoGrid } from './hero-photo-grid';

/**
 * S-15 (pedido del cliente): un cuadro sin foto real sigue mostrando el
 * collage decorativo de siempre (ícono + degradé); uno con foto la muestra en
 * su lugar. Nunca rompe el layout de 4 cuadros sin importar cuántas fotos
 * reales haya (0 a 4).
 */
describe('HeroPhotoGrid (S-15)', () => {
  it('shows the decorative icon collage by default (no photos prop)', () => {
    const { container } = render(<HeroPhotoGrid />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('svg')).toHaveLength(4);
  });

  it('shows the decorative collage when photos is an empty array', () => {
    const { container } = render(<HeroPhotoGrid photos={[]} />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('shows a real photo only for the slots that have one, icon for the rest', () => {
    const { container } = render(
      <HeroPhotoGrid photos={['https://cdn.test/a.jpg', undefined as unknown as string]} />,
    );
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://cdn.test/a.jpg');
    // The other 3 slots (2 of them past the sparse array, 1 explicitly undefined) keep the icon.
    expect(container.querySelectorAll('svg')).toHaveLength(3);
  });

  it('shows all 4 real photos when all 4 slots are filled', () => {
    const photos = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'].map((f) => `https://cdn.test/${f}`);
    const { container } = render(<HeroPhotoGrid photos={photos} />);
    expect(container.querySelectorAll('img')).toHaveLength(4);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('keeps the accessible "Mascotas en adopción" label regardless of photos', () => {
    render(<HeroPhotoGrid photos={['https://cdn.test/a.jpg']} />);
    expect(screen.getByRole('img', { name: 'Mascotas en adopción' })).toBeInTheDocument();
  });
});
