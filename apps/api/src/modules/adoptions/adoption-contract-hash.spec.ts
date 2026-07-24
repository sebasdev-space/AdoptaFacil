import type { AdoptionContractPayload } from '@adoptafacil/contracts';
import { canonicalContractString, computeContractHash } from './adoption-contract-hash';

const payload: AdoptionContractPayload = {
  requestId: '11111111-1111-1111-1111-111111111111',
  organizationId: '22222222-2222-2222-2222-222222222222',
  animalId: '33333333-3333-3333-3333-333333333333',
  animal: { animalId: '33333333-3333-3333-3333-333333333333', name: 'Firulais', species: 'dog' },
  applicant: { fullName: 'Adoptante Uno', email: 'a1@test.local' },
  applicableLaws: ['Ley 527/1999', 'Ley 1581/2012'],
  terms: 'Cláusulas del contrato de adopción.',
};

describe('adoption contract hash', () => {
  it('is deterministic and a 64-char sha256 hex digest', () => {
    const h = computeContractHash(payload);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeContractHash(payload)).toBe(h);
  });

  it('is INVARIANT to object key order (canonical serialization)', () => {
    // Same content, keys inserted in a different order.
    const reordered: AdoptionContractPayload = {
      terms: payload.terms,
      applicant: { email: payload.applicant.email, fullName: payload.applicant.fullName },
      applicableLaws: payload.applicableLaws,
      animal: { species: 'dog', name: 'Firulais', animalId: payload.animalId },
      animalId: payload.animalId,
      organizationId: payload.organizationId,
      requestId: payload.requestId,
    };
    expect(canonicalContractString(reordered)).toBe(canonicalContractString(payload));
    expect(computeContractHash(reordered)).toBe(computeContractHash(payload));
  });

  it('changes when any content changes (tamper-evident seal)', () => {
    const tampered = { ...payload, terms: payload.terms + ' (alterado)' };
    expect(computeContractHash(tampered)).not.toBe(computeContractHash(payload));
  });
});
