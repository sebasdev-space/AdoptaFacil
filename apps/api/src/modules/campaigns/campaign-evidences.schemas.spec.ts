import { CampaignEvidenceType } from '@adoptafacil/contracts';
import { createCampaignEvidenceSchema } from './campaign-evidences.schemas';

const BASE = {
  type: CampaignEvidenceType.Invoice,
  concept: 'Compra de medicamentos',
  amount: 120_000,
  spentAt: '2026-07-01T00:00:00.000Z',
  filename: 'factura.pdf',
};

describe('createCampaignEvidenceSchema (T-054)', () => {
  it('accepts a valid invoice with an integer COP amount', () => {
    expect(createCampaignEvidenceSchema.safeParse(BASE).success).toBe(true);
  });

  it('accepts a photo WITHOUT an amount (optional)', () => {
    const { amount: _drop, ...noAmount } = BASE;
    expect(
      createCampaignEvidenceSchema.safeParse({
        ...noAmount,
        type: CampaignEvidenceType.Photo,
        filename: 'ejecucion.jpg',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-integer amount (money is never float)', () => {
    expect(createCampaignEvidenceSchema.safeParse({ ...BASE, amount: 100.5 }).success).toBe(false);
  });

  it('rejects a negative amount', () => {
    expect(createCampaignEvidenceSchema.safeParse({ ...BASE, amount: -1 }).success).toBe(false);
  });

  it('rejects a type outside the closed enum', () => {
    expect(createCampaignEvidenceSchema.safeParse({ ...BASE, type: 'bribe' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(createCampaignEvidenceSchema.safeParse({ ...BASE, sneaky: 1 }).success).toBe(false);
  });
});
