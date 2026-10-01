import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ResourceOfferProofStatus } from '@adoptafacil/contracts';
import type { AuditService } from '../../core/audit/audit.service';
import type { StoragePort } from '../../core/storage/storage.port';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { validateResourceOfferProofSchema } from './resource-offers.schemas';
import { ResourceOfferProofsService } from './resource-offer-proofs.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OFFER = '22222222-2222-4222-8222-222222222222';
const DONOR = { id: '33333333-3333-4333-8333-333333333333' } as never;
const FILE = {
  buffer: Buffer.from('x'),
  mimetype: 'image/png',
  size: 1,
  originalname: 'factura.png',
};

function makeHarness() {
  const queryRaw = jest.fn();
  const record = jest.fn().mockResolvedValue({});
  const recordWithTx = jest.fn().mockResolvedValue({});
  const createUploadTarget = jest
    .fn()
    .mockResolvedValue({ key: `private/${ORG}/k-factura.png`, url: 'u' });
  const saveObject = jest.fn().mockResolvedValue(undefined);
  const tx = {
    resourceOffer: { findUnique: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    resourceOfferProof: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const prisma = {
    $queryRaw: queryRaw,
    withOrgContext: jest.fn((_org: string, fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const service = new ResourceOfferProofsService(
    prisma,
    { getOrganizationId: () => ORG } as unknown as TenantContextService,
    { record, recordWithTx } as unknown as AuditService,
    {
      createUploadTarget,
      saveObject,
      resolvePublicUrl: jest.fn(),
      readObject: jest.fn(),
    } as unknown as StoragePort,
    { get: () => 15 } as unknown as ConfigService<never, true>,
  );
  return { service, queryRaw, record, recordWithTx, createUploadTarget, saveObject, tx };
}

describe('ResourceOfferProofsService.attach (donante)', () => {
  it('guarda el archivo PRIVADO, inserta vía función acotada y audita', async () => {
    const h = makeHarness();
    h.queryRaw
      .mockResolvedValueOnce([
        { organization_id: ORG, status: 'offered', proof_status: null, proof_count: 0 },
      ])
      .mockResolvedValueOnce([
        {
          id: 'p1',
          organization_id: ORG,
          offer_id: OFFER,
          filename: 'factura.png',
          content_type: 'image/png',
          size_bytes: 1,
          created_at: new Date('2026-10-01T00:00:00Z'),
        },
      ]);
    const proof = await h.service.attach(DONOR, OFFER, FILE);
    expect(h.createUploadTarget).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, visibility: 'private' }),
    );
    expect(h.saveObject).toHaveBeenCalled();
    expect(proof).toMatchObject({
      id: 'p1',
      offerId: OFFER,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resource_offer.proof_attached', organizationId: ORG }),
    );
  });

  it('404 si la oferta no es del donante', async () => {
    const h = makeHarness();
    h.queryRaw.mockResolvedValueOnce([]);
    await expect(h.service.attach(DONOR, OFFER, FILE)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.saveObject).not.toHaveBeenCalled();
  });

  it('rechaza tipo no permitido y prueba ya aprobada sin tocar storage', async () => {
    const h = makeHarness();
    await expect(
      h.service.attach(DONOR, OFFER, { ...FILE, mimetype: 'application/zip' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    h.queryRaw.mockResolvedValueOnce([
      { organization_id: ORG, status: 'accepted', proof_status: 'approved', proof_count: 1 },
    ]);
    await expect(h.service.attach(DONOR, OFFER, FILE)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.saveObject).not.toHaveBeenCalled();
  });
});

describe('ResourceOfferProofsService.validate (organización)', () => {
  const ACTOR = '44444444-4444-4444-8444-444444444444';
  const updatedRow = (status: string, reason: string | null) => ({
    id: OFFER,
    organizationId: ORG,
    needId: 'n1',
    donorUserId: 'd1',
    quantityOffered: 3,
    message: null,
    status: 'offered',
    proofStatus: status,
    proofValidatedByUserId: ACTOR,
    proofValidatedAt: new Date('2026-10-01T10:00:00Z'),
    proofValidationReason: reason,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
  });
  const pending = { id: OFFER, needId: 'n1', proofStatus: 'pending' };

  it('aprueba una prueba pending: registra validador, fecha UTC y audita', async () => {
    const h = makeHarness();
    h.tx.resourceOffer.findUnique.mockResolvedValue(pending);
    h.tx.resourceOffer.updateMany.mockResolvedValue({ count: 1 });
    h.tx.resourceOffer.findUniqueOrThrow.mockResolvedValue(updatedRow('approved', null));
    const out = await h.service.validate(ACTOR, OFFER, { decision: 'approve' });
    expect(out.proofStatus).toBe(ResourceOfferProofStatus.Approved);
    expect(out.proofValidatedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(h.tx.resourceOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OFFER, proofStatus: 'pending' } }),
    );
    expect(h.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'resource_offer.proof_approved', actorUserId: ACTOR }),
    );
  });

  it('rechazar exige motivo', async () => {
    const h = makeHarness();
    await expect(h.service.validate(ACTOR, OFFER, { decision: 'reject' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.tx.resourceOffer.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con motivo y guarda el motivo', async () => {
    const h = makeHarness();
    h.tx.resourceOffer.findUnique.mockResolvedValue(pending);
    h.tx.resourceOffer.updateMany.mockResolvedValue({ count: 1 });
    h.tx.resourceOffer.findUniqueOrThrow.mockResolvedValue(updatedRow('rejected', 'Foto borrosa'));
    const out = await h.service.validate(ACTOR, OFFER, {
      decision: 'reject',
      reason: ' Foto borrosa ',
    });
    expect(out.proofStatus).toBe(ResourceOfferProofStatus.Rejected);
    expect(out.proofValidationReason).toBe('Foto borrosa');
    expect(h.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'resource_offer.proof_rejected' }),
    );
  });

  it('no valida si la prueba ya fue decidida, no existe, o la oferta no existe', async () => {
    const h = makeHarness();
    h.tx.resourceOffer.findUnique.mockResolvedValueOnce({ ...pending, proofStatus: 'approved' });
    await expect(h.service.validate(ACTOR, OFFER, { decision: 'approve' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    h.tx.resourceOffer.findUnique.mockResolvedValueOnce({ ...pending, proofStatus: null });
    await expect(h.service.validate(ACTOR, OFFER, { decision: 'approve' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    h.tx.resourceOffer.findUnique.mockResolvedValueOnce(null);
    await expect(h.service.validate(ACTOR, OFFER, { decision: 'approve' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.tx.resourceOffer.updateMany).not.toHaveBeenCalled();
  });
});

describe('validateResourceOfferProofSchema', () => {
  it('rechazo sin motivo es inválido; aprobar sin motivo es válido', () => {
    const parse = (v: unknown) => validateResourceOfferProofSchema.safeParse(v).success;
    expect(parse({ decision: 'reject' })).toBe(false);
    expect(parse({ decision: 'reject', reason: '  ' })).toBe(false);
    expect(parse({ decision: 'reject', reason: 'Ilegible' })).toBe(true);
    expect(parse({ decision: 'approve' })).toBe(true);
    expect(parse({ decision: 'maybe' })).toBe(false);
  });
});
