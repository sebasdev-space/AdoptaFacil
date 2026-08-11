import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  CampaignCategory,
  type CampaignAccountabilityReport,
  CampaignEvidenceType,
  CampaignStatus,
  type CampaignPublic,
} from '@adoptafacil/contracts';
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

const REPORT: CampaignAccountabilityReport = {
  campaign: { ...CAMPAIGN },
  evidences: [
    {
      id: 'e1',
      type: CampaignEvidenceType.Invoice,
      concept: 'Compra de insumos quirúrgicos',
      amount: 120000,
      spentAt: '2026-07-02T00:00:00.000Z',
      storageRef: 'public/org-1/abc-factura.pdf',
      url: 'http://localhost:3000/public/org-1/abc-factura.pdf',
      order: 0,
    },
  ],
  totalSpent: 120000,
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

/**
 * Stub fetch, routing by URL: the accountability endpoint returns `accountability`
 * (default: a report with no evidences), everything else returns the campaign
 * `body` with `status`.
 */
function stub(
  body: unknown,
  status = 200,
  accountability: unknown = { ...REPORT, evidences: [], totalSpent: 0 },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (String(url).includes('/accountability')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => accountability });
      }
      return Promise.resolve({ ok: status < 400, status, json: async () => body });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicCampaignDetailPage', () => {
  it('renders the public detail from nav-state (no campaign refetch)', () => {
    // Even from nav-state, the accountability report is fetched independently.
    stub(CAMPAIGN);
    renderDetail({ state: { campaign: CAMPAIGN } });

    expect(screen.getByTestId('public-campaign-detail')).toBeInTheDocument();
    expect(screen.getByText('Cirugía para Max')).toBeInTheDocument();
    expect(screen.getByText('Cirugías')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Necesitamos cubrir la cirugía de cadera de Max.')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-progress')).toBeInTheDocument();
  });

  it('pulido visual: uses the sticky-footer flex layout so the footer never sits mid-screen on short content', () => {
    stub(CAMPAIGN);
    renderDetail({ state: { campaign: CAMPAIGN } });

    const main = screen.getByRole('main');
    expect(main.className).toContain('flex-1');
    expect(main.parentElement?.className).toContain('flex');
    expect(main.parentElement?.className).toContain('min-h-screen');
    expect(main.parentElement?.className).toContain('flex-col');
  });

  it('shows the public accountability report (evidences + declared total)', async () => {
    stub(CAMPAIGN, 200, REPORT);
    renderDetail({ state: { campaign: CAMPAIGN } });

    expect(await screen.findByTestId('accountability-evidences')).toBeInTheDocument();
    expect(screen.getByText('Compra de insumos quirúrgicos')).toBeInTheDocument();
    expect(screen.getByText('Factura')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver soporte' })).toHaveAttribute(
      'href',
      REPORT.evidences[0].url,
    );
    // Declared-spending total is shown; no "% ejecutado" is invented.
    expect(screen.getByText(/Gasto declarado/i)).toBeInTheDocument();
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
