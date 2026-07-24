import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdoptionContract } from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { AdoptionContractPanel } from './adoption-contract-panel';

/**
 * T-028b — the contract panel on an approved request. Verifies the org-facing
 * states: no contract yet → offer to generate (only when the user may manage);
 * a signed contract → show it sealed (hash) and immutable, no generate button.
 */
function providers(roles: Role[], children: React.ReactNode) {
  return (
    <AppProviders
      session={{
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Owner',
          email: 'owner@refugio.org',
          roles,
          organizationId: 'org-1',
          accountType: 'organization',
        },
      }}
    >
      {children}
    </AppProviders>
  );
}

const SIGNED: AdoptionContract = {
  id: 'c1',
  organizationId: 'org-1',
  requestId: 'req-1',
  animalId: 'an-1',
  version: 1,
  status: 'signed',
  signers: [
    {
      id: 's1',
      role: 'organization_representative',
      fullName: 'Rep',
      email: 'rep@refugio.org',
      userId: 'u1',
      signedAt: '2026-07-24T15:00:00.000Z',
      signatureId: 'fake:aaa',
    },
    {
      id: 's2',
      role: 'adopter',
      fullName: 'Adoptante',
      email: 'a@test.local',
      userId: 'u2',
      signedAt: '2026-07-24T16:00:00.000Z',
      signatureId: 'fake:bbb',
    },
  ],
  payload: {
    requestId: 'req-1',
    organizationId: 'org-1',
    animalId: 'an-1',
    animal: { animalId: 'an-1', name: 'Firulais', species: 'dog' },
    applicant: { fullName: 'Adoptante', email: 'a@test.local' },
    applicableLaws: ['Ley 527/1999', 'Ley 1581/2012'],
    terms: 'Cláusulas.',
  },
  contentHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  createdAt: '2026-07-24T14:00:00.000Z',
  updatedAt: '2026-07-24T16:00:00.000Z',
  signedAt: '2026-07-24T16:00:00.000Z',
};

function stubFetch(handler: (url: string) => { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const { ok, status, body } = handler(String(input));
      return Promise.resolve({
        ok,
        status,
        statusText: '',
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AdoptionContractPanel', () => {
  it('offers to generate the contract when none exists and the user may manage', async () => {
    stubFetch(() => ({ ok: false, status: 404, body: {} }));
    render(providers([Role.Owner], <AdoptionContractPanel requestId="req-1" canManage />));
    expect(await screen.findByRole('button', { name: 'Generar contrato' })).toBeInTheDocument();
  });

  it('shows a signed contract sealed by hash, with no generate button', async () => {
    stubFetch((url) =>
      url.includes('/adoptions/contracts/by-request/')
        ? { ok: true, status: 200, body: SIGNED }
        : { ok: true, status: 200, body: {} },
    );
    render(providers([Role.Owner], <AdoptionContractPanel requestId="req-1" canManage />));
    expect(await screen.findByText('Firmado')).toBeInTheDocument();
    expect(screen.getByText(/Sellado · hash/)).toBeInTheDocument();
    expect(screen.getByText(/Firmas: 2\/2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar contrato' })).not.toBeInTheDocument();
  });

  it('does not offer generation to a user who cannot manage (deny-by-default)', () => {
    stubFetch(() => ({ ok: true, status: 200, body: {} }));
    render(providers([], <AdoptionContractPanel requestId="req-1" canManage={false} />));
    expect(screen.getByText('Sin contrato de adopción.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar contrato' })).not.toBeInTheDocument();
  });
});
