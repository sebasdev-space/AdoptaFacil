import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CampaignCategory, CampaignStatus, type CampaignPublic } from '@adoptafacil/contracts';
import { PublicCampaignDetailPage } from './public-campaign-detail-page';

/**
 * §M14/M06 (T-055) — public campaign detail by id. Public columns only; nav-state
 * from the card avoids a refetch, deep link resolves via GET /public/campaigns/:id.
 */
const CAMPAIGN: CampaignPublic = {
  id: 'c1',
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  title: 'Cirugía para Max',
  description: 'Necesitamos cubrir la cirugía de cadera de Max.',
  category: CampaignCategory.Surgeries,
  goalAmount: 2000000,
  raisedAmount: 0,
  progress: 0,
  deadline: '2026-12-31T00:00:00.000Z',
  status: CampaignStatus.Active,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function renderDetail(options: { state?: { campaign: CampaignPublic } } = {}) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/campanas/c1', state: options.state ?? null }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/campanas/:id" element={<PublicCampaignDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function stub(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: status < 400, status, json: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicCampaignDetailPage', () => {
  it('renders the public detail from nav-state (no refetch)', () => {
    renderDetail({ state: { campaign: CAMPAIGN } });

    expect(screen.getByTestId('public-campaign-detail')).toBeInTheDocument();
    expect(screen.getByText('Cirugía para Max')).toBeInTheDocument();
    expect(screen.getByText('Cirugías')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Necesitamos cubrir la cirugía de cadera de Max.')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-progress')).toBeInTheDocument();
  });

  it('resolves the campaign from the endpoint on a deep link (no nav-state)', async () => {
    stub(CAMPAIGN);
    renderDetail();
    expect(await screen.findByTestId('public-campaign-detail')).toBeInTheDocument();
    expect(screen.getByText('Cirugía para Max')).toBeInTheDocument();
  });

  it('shows a not-found state when the campaign does not exist (404)', async () => {
    stub({ message: 'Campaign not found' }, 404);
    renderDetail();
    expect(await screen.findByText('Campaña no encontrada')).toBeInTheDocument();
    expect(screen.queryByTestId('public-campaign-detail')).not.toBeInTheDocument();
  });
});
