import {
  computeDisclosureHash,
  type DisclosureHashPayload,
} from './animal-behavior-disclosure-hash';

const basePayload: DisclosureHashPayload = {
  animalId: 'animal-1',
  signedByName: 'Claudia Vásquez',
  reactivityNotes: 'Reactivo con gatos',
  biteHistory: false,
  biteHistoryDetail: null,
  childrenCompatibility: 'with_supervision',
  medicalConditionsRelevant: 'Alimento senior',
  declaredByUserId: 'user-1',
};

describe('computeDisclosureHash', () => {
  it('is deterministic for the same payload', () => {
    expect(computeDisclosureHash(basePayload)).toBe(computeDisclosureHash({ ...basePayload }));
  });

  it('produces a 64-char hex SHA-256 digest', () => {
    const hash = computeDisclosureHash(basePayload);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any sealed field changes', () => {
    const original = computeDisclosureHash(basePayload);
    expect(computeDisclosureHash({ ...basePayload, biteHistory: true })).not.toBe(original);
    expect(
      computeDisclosureHash({ ...basePayload, childrenCompatibility: 'not_recommended' }),
    ).not.toBe(original);
    expect(computeDisclosureHash({ ...basePayload, signedByName: 'Otro Nombre' })).not.toBe(
      original,
    );
  });

  it('is independent of property declaration order (canonical serialization)', () => {
    const reordered: DisclosureHashPayload = {
      declaredByUserId: basePayload.declaredByUserId,
      medicalConditionsRelevant: basePayload.medicalConditionsRelevant,
      childrenCompatibility: basePayload.childrenCompatibility,
      biteHistoryDetail: basePayload.biteHistoryDetail,
      biteHistory: basePayload.biteHistory,
      reactivityNotes: basePayload.reactivityNotes,
      signedByName: basePayload.signedByName,
      animalId: basePayload.animalId,
    };
    expect(computeDisclosureHash(reordered)).toBe(computeDisclosureHash(basePayload));
  });
});
