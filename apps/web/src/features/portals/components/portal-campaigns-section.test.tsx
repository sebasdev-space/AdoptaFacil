import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CampaignCategory, CampaignStatus, type CampaignPublic } from '@adoptafacil/contracts';
import { PortalCampaignsSection } from './portal-campaigns-section';

/**
 * §M14/M06 (F-CAMPANAS-PORTAL-2, S2-07) — the public "Campaña activa" section
 * of an org's portal. Same anti-regression shape as `PortalAdoptionSection`
 * (T-028c): the endpoint returns a WRAPPED page (`{ items, total, limit,
 * offset }`); the section must read `.items`, normalize a non-array to `[]`,
 * and never `.map` over a non-array. Rendered under a router because
 * `CampaignCard` links to the public campaign detail.
 */
function campaign(id: string, title: string, over: Partial<CampaignPublic> = {}): CampaignPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    title,
    category: CampaignCategory.Medications,
    goalAmount: 1_000_000,
    raisedAmount: 0,
    progress: 0,
    deadline: '2027-01-01T00:00:00.000Z',
    status: CampaignStatus.Active,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function stubCampaigns(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

function renderSection() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PortalCampaignsSection slug="patitas" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalCampaignsSection', () => {
  it('renders a card per active campaign read from the wrapped `.items`, with real data', async () => {
    stubCampaigns({
      items: [
        campaign('c1', 'Vacunas para el invierno', { raisedAmount: 250_000, progress: 0.25 }),
        campaign('c2', 'Techo del refugio'),
      ],
      total: 2,
      limit: 12,
      offset: 0,
    });
    renderSection();

    const cards = await screen.findAllByTestId('campaign-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Vacunas para el invierno')).toBeInTheDocument();
    expect(screen.getByText('Techo del refugio')).toBeInTheDocument();
    // Real org name and real progress come straight from the contract, never fabricated.
    expect(screen.getAllByText('Refugio Patitas').length).toBe(2);
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    stubCampaigns({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();

    expect(
      await screen.findByText(
        'Esta organización no tiene una campaña de recaudación activa por ahora.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('campaign-card')).not.toBeInTheDocument();
  });

  it('T-028c regression: a NON-array body normalizes to [] → empty state, never .map throws', async () => {
    stubCampaigns({ items: null, total: 0 });
    renderSection();

    expect(
      await screen.findByText(
        'Esta organización no tiene una campaña de recaudación activa por ahora.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a clear error state (not a crash) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    );
    renderSection();

    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
  });
});
