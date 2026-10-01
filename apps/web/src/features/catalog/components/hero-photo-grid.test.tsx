import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroPhotoGrid } from './hero-photo-grid';

function stubFetch(result: { ok: boolean; body?: unknown } | 'reject') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      result === 'reject'
        ? Promise.reject(new Error('net'))
        : Promise.resolve({
            ok: result.ok,
            status: result.ok ? 200 : 500,
            json: async () => result.body,
          }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('HeroPhotoGrid', () => {
  it('shows the icon fallback when no photos are configured', async () => {
    stubFetch({ ok: true, body: { items: [] } });
    render(<HeroPhotoGrid />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: 'Mascotas en adopción' })).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('falls back when the request fails or the body has an unexpected shape', async () => {
    stubFetch('reject');
    const { unmount } = render(<HeroPhotoGrid />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: 'Mascotas en adopción' })).toBeInTheDocument();
    unmount();
    stubFetch({ ok: true, body: { data: [], total: 0 } });
    render(<HeroPhotoGrid />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: 'Mascotas en adopción' })).toBeInTheDocument();
  });

  it('renders configured photos with their alt text and keeps fallback for free slots', async () => {
    stubFetch({
      ok: true,
      body: {
        items: [
          { id: 'p1', imageUrl: 'http://x/a.jpg', altText: 'Perro en un parque' },
          { id: 'p2', imageUrl: 'http://x/b.jpg', altText: 'Gato dormido' },
        ],
      },
    });
    render(<HeroPhotoGrid />);
    const dog = await screen.findByAltText('Perro en un parque');
    expect(dog).toHaveAttribute('src', 'http://x/a.jpg');
    expect(screen.getByAltText('Gato dormido')).toBeInTheDocument();
    expect(document.querySelectorAll('svg')).toHaveLength(2);
  });
});
