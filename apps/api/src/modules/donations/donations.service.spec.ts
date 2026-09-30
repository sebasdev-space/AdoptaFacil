import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { NotificationPort } from '../../core/notifications/notification.port';
import type { PaymentPort } from '@adoptafacil/contracts';
import type { CampaignFundingService } from '../campaigns/campaign-funding.service';
import type { DonationCertificatesService } from './donation-certificates.service';
import { DonationsService } from './donations.service';

interface Harness {
  service: DonationsService;
  queryRaw: jest.Mock;
  record: jest.Mock;
  createCollection: jest.Mock;
  getOrganizationId: jest.Mock;
  withOrgContext: jest.Mock;
  send: jest.Mock;
  donationAccessLinkCreate: jest.Mock;
  donationAccessLinkFindUnique: jest.Mock;
  organizationFindMany: jest.Mock;
  tryIssueForApprovedDonation: jest.Mock;
}

function makeService(): Harness {
  const queryRaw = jest.fn();
  const record = jest.fn().mockResolvedValue({});
  const createCollection = jest.fn().mockResolvedValue({ collectionId: 'col-1' });
  const getOrganizationId = jest.fn();
  const withOrgContext = jest.fn();
  const send = jest.fn().mockResolvedValue(undefined);
  const donationAccessLinkCreate = jest.fn().mockResolvedValue({});
  const donationAccessLinkFindUnique = jest.fn();
  const organizationFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    $queryRaw: queryRaw,
    withOrgContext,
    donationAccessLink: {
      create: donationAccessLinkCreate,
      findUnique: donationAccessLinkFindUnique,
    },
    organization: { findMany: organizationFindMany },
  } as unknown as PrismaService;
  const tenant = { getOrganizationId } as unknown as TenantContextService;
  const audit = { record } as unknown as AuditService;
  const verifyAndNormalizeWebhook = jest.fn(
    async (payload: { collectionId: string; status: string; eventId?: string }) => ({
      eventId: payload.eventId ?? 'evt-1',
      collectionId: payload.collectionId,
      status: payload.status,
      dedupKey: payload.eventId ?? 'evt-1',
    }),
  );
  const payment = { createCollection, verifyAndNormalizeWebhook } as unknown as PaymentPort;
  const notifications = { send } as unknown as NotificationPort;
  const applyApprovedCollection = jest.fn().mockResolvedValue(undefined);
  const tryIssueForApprovedDonation = jest.fn().mockResolvedValue(undefined);
  const campaignFunding = { applyApprovedCollection } as unknown as CampaignFundingService;
  const certificates = { tryIssueForApprovedDonation } as unknown as DonationCertificatesService;
  const config = { get: () => 'https://app.test.local' } as unknown as ConfigService<
    Record<string, unknown>,
    true
  >;
  return {
    service: new DonationsService(
      prisma,
      tenant,
      audit,
      payment,
      notifications,
      campaignFunding,
      certificates,
      config,
    ),
    queryRaw,
    record,
    createCollection,
    getOrganizationId,
    withOrgContext,
    send,
    donationAccessLinkCreate,
    donationAccessLinkFindUnique,
    organizationFindMany,
    tryIssueForApprovedDonation,
  };
}

const BASE_INPUT = {
  organizationId: 'org-1',
  intendedAmount: 50_000,
  commissionPayer: 'organization' as const,
  idempotencyKey: 'idem-key-guest-1',
};

/**
 * Guest checkout (client requirement, final): donating must never require an
 * account/login. `create(actor, input)` receives `actor: undefined` for a
 * guest (set by `OptionalJwtAuthGuard`, which never rejects the request).
 */
describe('DonationsService.create — guest checkout', () => {
  it('succeeds with no actor when payer.email is present; donor_user_id travels as null', async () => {
    const h = makeService();
    // First $queryRaw call: idempotency pre-check (donation_by_idempotency) → none yet.
    h.queryRaw.mockResolvedValueOnce([]);
    // Second call: create_donation → the inserted row, donor_user_id null.
    h.queryRaw.mockResolvedValueOnce([
      {
        id: 'don-1',
        organization_id: 'org-1',
        donor_user_id: null,
        concept_kind: 'organization',
        concept_id: 'org-1',
        commission_payer: 'organization',
        intended_amount: 50_000,
        amount_charged: 50_000,
        currency: 'COP',
        breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
        collection_id: 'col-1',
        idempotency_key: 'idem-key-guest-1',
        status: 'pending',
        payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
        anonymous: false,
        created_at: new Date('2026-09-28T00:00:00.000Z'),
        updated_at: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.donorUserId).toBeNull();
    expect(result.id).toBe('don-1');
    // The raw call's 2nd positional arg (donor_user_id) is null for a guest.
    const createCallArgs = h.queryRaw.mock.calls[1][0] as { values: unknown[] };
    expect(createCallArgs.values[1]).toBeNull();
    // Audited with actorUserId: null (same precedent as the webhook path).
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null, action: 'donation.created' }),
    );
  });

  it('rejects with BadRequestException when there is no actor and no payer.email', async () => {
    const h = makeService();

    await expect(h.service.create(undefined, { ...BASE_INPUT })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Fails fast — never reaches the idempotency check, the collection, or the DB write.
    expect(h.queryRaw).not.toHaveBeenCalled();
    expect(h.createCollection).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it('rejects when payer is provided but without an email', async () => {
    const h = makeService();

    await expect(
      h.service.create(undefined, { ...BASE_INPUT, payer: { fullName: 'Sin correo' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.queryRaw).not.toHaveBeenCalled();
  });
});

/**
 * The MercadoPago checkout redirect bug fix: `PaymentPort.createCollection()`
 * already returns `paymentLinkUrl` — this was discarded before reaching the
 * caller. `create()` must attach it to the JUST-CREATED response only, never
 * persist it, and never attach it on the idempotent-replay short-circuit.
 */
describe('DonationsService.create — paymentLinkUrl (checkout redirect fix)', () => {
  function donationRow() {
    return {
      id: 'don-1',
      organization_id: 'org-1',
      donor_user_id: null,
      concept_kind: 'organization',
      concept_id: 'org-1',
      commission_payer: 'organization',
      intended_amount: 50_000,
      amount_charged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collection_id: 'col-1',
      idempotency_key: 'idem-key-guest-1',
      status: 'pending',
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      anonymous: false,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:00:00.000Z'),
    };
  }

  it('attaches the gateway paymentLinkUrl to a freshly-created donation', async () => {
    const h = makeService();
    h.createCollection.mockResolvedValueOnce({
      collectionId: 'col-1',
      paymentLinkUrl: 'https://mp.test/checkout/pref-1',
    });
    h.queryRaw.mockResolvedValueOnce([]); // idempotency pre-check: none yet
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.paymentLinkUrl).toBe('https://mp.test/checkout/pref-1');
  });

  it('never attaches paymentLinkUrl on an idempotent replay (no fresh gateway call)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([donationRow()]); // idempotency pre-check: found

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.paymentLinkUrl).toBeUndefined();
    expect(h.createCollection).not.toHaveBeenCalled();
  });
});

/**
 * PUBLIC "gracias" lookup (MercadoPago redirect-back) — resolves by
 * `collectionId` (== the payer's `external_reference`), never distinguishes
 * an unknown reference from any other 404 reason.
 */
describe('DonationsService.getPublicStatusByCollectionId', () => {
  it('returns status/amount/currency/organizationName for a known collectionId', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([
      {
        id: 'don-1',
        organization_id: 'org-1',
        status: 'approved',
        amount_charged: 50_000,
        currency: 'COP',
      },
    ]);
    h.organizationFindMany.mockResolvedValueOnce([{ id: 'org-1', name: 'Refugio Patitas' }]);

    const result = await h.service.getPublicStatusByCollectionId('col-1');

    expect(result).toEqual({
      status: 'approved',
      amountCharged: 50_000,
      currency: 'COP',
      organizationName: 'Refugio Patitas',
    });
  });

  it('throws a generic NotFoundException for an unknown collectionId', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]);

    await expect(h.service.getPublicStatusByCollectionId('does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/**
 * Org-facing anonymity (separate from guest checkout): `anonymous: true` on a
 * donation must mask the donor's identity from `GET /donations/received`
 * (`payer` + `receipt.donor`) WITHOUT touching what is persisted — amount/
 * date/status/breakdown stay exactly as stored.
 */
describe('DonationsService.listReceived — org-facing anonymity masking', () => {
  function donationModel(overrides: Record<string, unknown> = {}) {
    return {
      id: 'don-1',
      organizationId: 'org-1',
      donorUserId: 'donor-1',
      conceptKind: 'organization',
      conceptId: 'org-1',
      commissionPayer: 'organization',
      intendedAmount: 50_000,
      amountCharged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collectionId: 'col-1',
      status: 'approved',
      payer: { fullName: 'Donante Real', email: 'donante@test.dev' },
      anonymous: false,
      createdAt: new Date('2026-09-28T00:00:00.000Z'),
      updatedAt: new Date('2026-09-28T00:00:00.000Z'),
      receipt: {
        id: 'rec-1',
        organizationId: 'org-1',
        donationId: 'don-1',
        dedupKey: 'evt-1',
        donor: { fullName: 'Donante Real', email: 'donante@test.dev' },
        intendedAmount: 50_000,
        breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
        issuedAt: new Date('2026-09-28T00:05:00.000Z'),
      },
      ...overrides,
    };
  }

  it('exposes payer and receipt.donor as usual when anonymous is false', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    const findMany = jest.fn().mockResolvedValue([donationModel({ anonymous: false })]);
    h.withOrgContext.mockImplementation(async (_orgId, fn) => fn({ donation: { findMany } }));

    const [row] = await h.service.listReceived();

    expect(row.anonymous).toBe(false);
    expect(row.payer).toEqual({ fullName: 'Donante Real', email: 'donante@test.dev' });
    expect(row.receipt?.donor).toEqual({ fullName: 'Donante Real', email: 'donante@test.dev' });
    // Everything else is untouched.
    expect(row.breakdown).toEqual({ amountCharged: 50_000, gross: 50_000, net: 48_000 });
  });

  it('masks payer and receipt.donor (never the amount/date/status) when anonymous is true', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    const findMany = jest.fn().mockResolvedValue([donationModel({ anonymous: true })]);
    h.withOrgContext.mockImplementation(async (_orgId, fn) => fn({ donation: { findMany } }));

    const [row] = await h.service.listReceived();

    expect(row.anonymous).toBe(true);
    expect(row.payer).toBeUndefined();
    expect(row.receipt?.donor).toEqual({});
    // Non-identity fields are NEVER affected by the mask.
    expect(row.amountCharged).toBe(50_000);
    expect(row.status).toBe('approved');
    expect(row.breakdown).toEqual({ amountCharged: 50_000, gross: 50_000, net: 48_000 });
    expect(row.receipt?.intendedAmount).toBe(50_000);
  });

  it('masks correctly even with no receipt yet (pending donation)', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    const findMany = jest
      .fn()
      .mockResolvedValue([donationModel({ anonymous: true, status: 'pending', receipt: null })]);
    h.withOrgContext.mockImplementation(async (_orgId, fn) => fn({ donation: { findMany } }));

    const [row] = await h.service.listReceived();

    expect(row.anonymous).toBe(true);
    expect(row.payer).toBeUndefined();
    expect(row.receipt).toBeUndefined();
  });
});

/**
 * Guest "magic link" comprobante (client requirement, final): a GUEST donor
 * (no account) must be able to check their donation's status/receipt/
 * certificate later without registering. The link is generated INSIDE the
 * webhook, only when the just-approved donation has no `donorUserId` and a
 * `payer.email` to send it to — an authenticated donor already has
 * `/donations/mine` and must never receive one.
 */
describe('DonationsService.applyWebhook — guest access link (magic link)', () => {
  function webhookRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'don-1',
      organization_id: 'org-1',
      donor_user_id: null,
      concept_kind: 'organization',
      concept_id: 'org-1',
      commission_payer: 'organization',
      intended_amount: 50_000,
      amount_charged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collection_id: 'col-1',
      idempotency_key: 'idem-1',
      status: 'approved',
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      anonymous: false,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:05:00.000Z'),
      ...overrides,
    };
  }

  it('issues an access link and emails it when the approved donation has no donor (guest)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow()]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'approved', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).toHaveBeenCalledTimes(1);
    const createArgs = h.donationAccessLinkCreate.mock.calls[0][0] as {
      data: { donationId: string; tokenHash: string; expiresAt: Date };
    };
    expect(createArgs.data.donationId).toBe('don-1');
    // The RAW token is never persisted — only its SHA-256 hex hash (64 chars).
    expect(createArgs.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // 30-day TTL (within a second of tolerance for test execution time).
    const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(createArgs.data.expiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);

    expect(h.send).toHaveBeenCalledTimes(1);
    const message = h.send.mock.calls[0][0] as { to: string; body: string };
    expect(message.to).toBe('guest@test.dev');
    expect(message.body).toContain('https://app.test.local/donaciones/comprobante?token=');
    // The email never logs/exposes the token anywhere else — audited with no token metadata.
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'donation.access_link_issued', metadata: {} }),
    );
  });

  it('does NOT issue an access link for an authenticated donor (donorUserId present)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow({ donor_user_id: 'user-1' })]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'approved', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('does NOT issue an access link when the webhook declines the donation', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow({ status: 'declined', donor_user_id: null })]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'declined', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('does NOT issue an access link for a guest with no payer.email', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow({ payer: null })]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'approved', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});

/**
 * PUBLIC guest donation access (`GET /public/donations/access/:token`): the
 * token itself is the credential. Missing/expired/unknown tokens must ALL
 * yield the exact same generic 404 — never distinguishable to a caller
 * probing tokens.
 */
describe('DonationsService.getByAccessToken', () => {
  const donationRow = {
    id: 'don-1',
    organization_id: 'org-1',
    donor_user_id: null,
    concept_kind: 'organization',
    concept_id: 'org-1',
    commission_payer: 'organization',
    intended_amount: 50_000,
    amount_charged: 50_000,
    currency: 'COP',
    breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
    collection_id: 'col-1',
    idempotency_key: 'idem-1',
    status: 'approved',
    payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    anonymous: false,
    created_at: new Date('2026-09-28T00:00:00.000Z'),
    updated_at: new Date('2026-09-28T00:05:00.000Z'),
  };

  it('returns the donation (+ receipt/certificate if present) for a valid, unexpired token', async () => {
    const h = makeService();
    h.donationAccessLinkFindUnique.mockResolvedValue({
      id: 'link-1',
      donationId: 'don-1',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      createdAt: new Date(),
    });
    // 1st raw call: donation_by_id · 2nd: donation_receipt_by_donation · 3rd: donation_certificate_by_donation.
    h.queryRaw
      .mockResolvedValueOnce([donationRow])
      .mockResolvedValueOnce([
        {
          id: 'rec-1',
          organization_id: 'org-1',
          donation_id: 'don-1',
          dedup_key: 'evt-1',
          donor: { fullName: 'Invitado Test', email: 'guest@test.dev' },
          intended_amount: 50_000,
          breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
          issued_at: new Date('2026-09-28T00:05:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    h.organizationFindMany.mockResolvedValue([{ id: 'org-1', name: 'Refugio Beneficiario' }]);

    const result = await h.service.getByAccessToken('a-valid-raw-token');

    expect(result.donation.id).toBe('don-1');
    expect(result.donation.organizationName).toBe('Refugio Beneficiario');
    expect(result.receipt?.dedupKey).toBe('evt-1');
    expect(result.certificate).toBeUndefined();
  });

  it('rejects an EXPIRED token with a generic NotFoundException', async () => {
    const h = makeService();
    h.donationAccessLinkFindUnique.mockResolvedValue({
      id: 'link-1',
      donationId: 'don-1',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() - 1000), // already expired
      createdAt: new Date(),
    });

    await expect(h.service.getByAccessToken('an-expired-raw-token')).rejects.toMatchObject({
      status: 404,
    });
    // Never even reaches the donation lookup.
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an UNKNOWN/garbage token with the exact SAME generic 404 (never distinguishable)', async () => {
    const h = makeService();
    h.donationAccessLinkFindUnique.mockResolvedValue(null);

    let expiredError: unknown;
    let unknownError: unknown;
    try {
      const hExpired = makeService();
      hExpired.donationAccessLinkFindUnique.mockResolvedValue({
        id: 'link-1',
        donationId: 'don-1',
        tokenHash: 'x',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      });
      await hExpired.service.getByAccessToken('expired');
    } catch (error) {
      expiredError = error;
    }
    try {
      await h.service.getByAccessToken('totally-unknown-garbage');
    } catch (error) {
      unknownError = error;
    }

    expect(expiredError).toBeInstanceOf(Error);
    expect(unknownError).toBeInstanceOf(Error);
    expect((expiredError as { status: number }).status).toBe(
      (unknownError as { status: number }).status,
    );
    expect((expiredError as Error).message).toBe((unknownError as Error).message);
  });
});
