import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CampaignCategory, CampaignStatus, type CampaignPublic } from '@adoptafacil/contracts';
import { PublicCampaignsPage } from './public-campaigns-page';

/**
 * §M14/M06 (T-055) — public campaigns list. The endpoint returns a WRAPPED page
 * ({ items, total, limit, offset }); the page reads `.items`, normalizes a non-array
 * to [] (T-028c/T-052 regression) and shows an explicit empty state — never `.map`
 * over a non-array. Rendered under a router for the card links.
 */
function campaign(id: string, title: string, over: Partial<CampaignPublic> = {}): CampaignPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    title,
    category: CampaignCategory.Medications,
    goalAmount: 1000000,
    raisedAmount: 0,
    progress: 0,
    deadline: '2026-12-31T00:00:00.000Z',
    status: CampaignStatus.Active,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function stub(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

function renderList() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PublicCampaignsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicCampaignsPage', () => {
  it('renders a card per active campaign read from the wrapped `.items`', async () => {
    stub({
      items: [
        campaign('c1', 'Cirugía para Max', { category: CampaignCategory.Surgeries }),
        campaign('c2', 'Alimento de emergencia', { category: CampaignCategory.Food }),
      ],
      total: 2,
      limit: 24,
      offset: 0,
    });
    renderList();

    const cards = await screen.findAllByTestId('campaign-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Cirugía para Max')).toBeInTheDocument();
    expect(screen.getByText('Alimento de emergencia')).toBeInTheDocument();
    // Category shown with its Spanish label (closed enum).
    expect(screen.getByText('Cirugías')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response', async () => {
    stub({ items: [], total: 0, limit: 24, offset: 0 });
    renderList();
    expect(
      await screen.findByText('No hay campañas activas ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('campaign-card')).not.toBeInTheDocument();
  });

  it('T-028c regression: a NON-array body normalizes to [] → empty state, never throws', async () => {
    stub({ items: null, total: 0 });
    renderList();
    expect(
      await screen.findByText('No hay campañas activas ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
  });

  it('shows the progress read straight from the contract (0 today, no self-calc)', async () => {
    stub({ items: [campaign('c1', 'Cirugía para Max')], total: 1, limit: 24, offset: 0 });
    renderList();
    await screen.findByTestId('campaign-card');
    // raisedAmount/progress are 0 until the real collection is wired — shown as 0%.
    expect(screen.getByTestId('campaign-progress')).toHaveTextContent('0%');
  });
});
