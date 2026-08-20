import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { computeBreakdown } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { pesosToCents, WompiPaymentAdapter, type WompiFetch } from './wompi-payment.adapter';

const ENV: Record<string, unknown> = {
  WOMPI_BASE_URL: 'https://sandbox.wompi.co/v1',
  WOMPI_PUBLIC_KEY: 'pub_test_dummy',
  WOMPI_PRIVATE_KEY: 'prv_test_dummy',
  WOMPI_EVENTS_SECRET: 'test_events_dummy',
};

function makeConfig(): ConfigService<Env, true> {
  return { get: (key: string) => ENV[key] } as unknown as ConfigService<Env, true>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a VALID Wompi webhook body + compute its checksum (test secret only). */
function signedWebhook(transaction: Record<string, unknown>, timestamp = 1_700_000_000) {
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const values = properties.map((path) => {
    const [, field] = path.split('.');
    return String((transaction as Record<string, unknown>)[field]);
  });
  const checksum = createHash('sha256')
    .update(`${values.join('')}${timestamp}${ENV.WOMPI_EVENTS_SECRET as string}`)
    .digest('hex');
  return {
    event: 'transaction.updated',
    data: { transaction },
    signature: { properties, checksum },
    timestamp,
    sent_at: '2026-07-28T00:00:00.000Z',
  };
}

/** Build a VALID Wompi payout webhook body + compute its checksum. */
function signedPayoutWebhook(payout: Record<string, unknown>, timestamp = 1_700_000_000) {
  const properties = ['payout.id', 'payout.status'];
  const values = properties.map((path) => {
    const [, field] = path.split('.');
    return String((payout as Record<string, unknown>)[field]);
  });
  const checksum = createHash('sha256')
    .update(`${values.join('')}${timestamp}${ENV.WOMPI_EVENTS_SECRET as string}`)
    .digest('hex');
  return {
    event: 'payout.updated',
    data: { payout },
    signature: { properties, checksum },
    timestamp,
  };
}

describe('pesosToCents (T-060)', () => {
  it('converts integer pesos to integer cents (×100), no float drift', () => {
    expect(pesosToCents(1)).toBe(100);
    expect(pesosToCents(50_000)).toBe(5_000_000);
    expect(pesosToCents(999_999_999)).toBe(99_999_999_900);
  });

  it('rejects non-positive or non-integer amounts', () => {
    expect(() => pesosToCents(0)).toThrow(RangeError);
    expect(() => pesosToCents(-1)).toThrow(RangeError);
    expect(() => pesosToCents(1.5)).toThrow(RangeError);
  });
});

describe('WompiPaymentAdapter (T-060, M15a — recaudo via Payment Links)', () => {
  const baseInput = {
    intendedAmount: 50_000,
    currency: 'COP' as const,
    concept: { kind: 'campaign' as const, id: 'campaign-1' },
    commissionPayer: 'organization' as const,
    idempotencyKey: 'idem-abc',
  };

  it('createCollection POSTs /payment_links with amount_in_cents + a reference derived from idempotencyKey', async () => {
    const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
      Promise.resolve(jsonResponse({ data: { id: 'link-123' } }, 201)),
    ) as unknown as WompiFetch;
    const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(baseInput);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://sandbox.wompi.co/v1/payment_links');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer prv_test_dummy');
    const body = JSON.parse(init.body as string);
    const expectedBreakdown = computeBreakdown(50_000, 'organization');
    expect(body.amount_in_cents).toBe(expectedBreakdown.amountCharged * 100);
    expect(body.currency).toBe('COP');
    expect(body.reference).toBe('af-idem-abc');

    expect(result).toEqual({
      collectionId: 'link-123',
      status: 'pending',
      breakdown: expectedBreakdown,
    });
  });

  it('is idempotent by reference: the SAME idempotencyKey always produces the SAME reference', async () => {
    const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
      Promise.resolve(jsonResponse({ data: { id: 'link-same' } }, 201)),
    ) as unknown as WompiFetch;
    const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

    const first = await adapter.createCollection(baseInput);
    const second = await adapter.createCollection(baseInput);

    const refs = (fetchFn as jest.Mock).mock.calls.map(
      ([, init]: [string, RequestInit]) => JSON.parse(init.body as string).reference,
    );
    expect(refs[0]).toBe(refs[1]);
    expect(first.collectionId).toBe(second.collectionId);
  });

  it('throws a clear error when Wompi rejects the payment_links call', async () => {
    const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
      Promise.resolve(jsonResponse({ error: { messages: {} } }, 422)),
    ) as unknown as WompiFetch;
    const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.createCollection(baseInput)).rejects.toThrow(/422/);
  });

  describe('getCollectionStatus', () => {
    it('maps the latest transaction status', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(
          jsonResponse({
            data: { id: 'link-1', transactions: [{ status: 'PENDING' }, { status: 'APPROVED' }] },
          }),
        ),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      await expect(adapter.getCollectionStatus('link-1')).resolves.toBe('approved');
    });

    it('returns pending for a link with no transactions yet', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(jsonResponse({ data: { id: 'link-1', transactions: [] } })),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      await expect(adapter.getCollectionStatus('link-1')).resolves.toBe('pending');
    });

    it('maps an unrecognized status to error', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(
          jsonResponse({ data: { id: 'link-1', transactions: [{ status: 'WEIRD' }] } }),
        ),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      await expect(adapter.getCollectionStatus('link-1')).resolves.toBe('error');
    });
  });

  describe('verifyAndNormalizeWebhook', () => {
    it('normalizes a VALID checksum to {eventId, collectionId, status, dedupKey}', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const webhook = signedWebhook({
        id: 'trx-1',
        status: 'APPROVED',
        amount_in_cents: 5_000_000,
        payment_link_id: 'link-123',
      });

      const event = adapter.verifyAndNormalizeWebhook(webhook, '');
      expect(event).toEqual({
        eventId: 'trx-1-APPROVED',
        collectionId: 'link-123',
        status: 'approved',
        dedupKey: 'trx-1-APPROVED',
      });
    });

    it('rejects an INVALID checksum', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const webhook = signedWebhook({
        id: 'trx-1',
        status: 'APPROVED',
        amount_in_cents: 5_000_000,
        payment_link_id: 'link-123',
      });
      webhook.signature.checksum = 'tampered';

      expect(() => adapter.verifyAndNormalizeWebhook(webhook, '')).toThrow(/checksum mismatch/);
    });

    it('rejects a payload missing the signature block', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      expect(() =>
        adapter.verifyAndNormalizeWebhook({ event: 'transaction.updated', data: {} }, ''),
      ).toThrow(/missing signature/);
    });

    it('rejects a transaction with no payment_link_id (not a Payment Links collection)', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const webhook = signedWebhook({
        id: 'trx-1',
        status: 'APPROVED',
        amount_in_cents: 5_000_000,
        payment_link_id: null,
      });

      expect(() => adapter.verifyAndNormalizeWebhook(webhook, '')).toThrow(/payment_link_id/);
    });
  });

  describe('createPayout (M15b — dispersión T+1)', () => {
    const bankAccount = {
      bankCode: '001',
      accountType: 'savings' as const,
      accountNumber: '1234567890',
      accountHolderName: 'Refugio Patitas',
      accountHolderDocument: '900123456-1',
    };
    const payoutInput = {
      beneficiaryOrgId: 'org-1',
      amount: 100_000,
      idempotencyKey: 'payout-abc',
      bankAccount,
    };

    it('POSTs /payouts with amount_in_cents + the destination bank account + a reference derived from idempotencyKey', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(jsonResponse({ data: { id: 'payout-123', status: 'PENDING' } }, 201)),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      const result = await adapter.createPayout(payoutInput);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
      expect(url).toBe('https://sandbox.wompi.co/v1/payouts');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer prv_test_dummy');
      const body = JSON.parse(init.body as string);
      expect(body.amount_in_cents).toBe(100_000 * 100);
      expect(body.currency).toBe('COP');
      expect(body.reference).toBe('af-payout-payout-abc');
      expect(body.bank_account).toEqual({
        type: 'SAVINGS',
        number: '1234567890',
        bank_code: '001',
        holder_name: 'Refugio Patitas',
        holder_document_number: '900123456-1',
      });

      expect(result).toEqual({ payoutId: 'payout-123', status: 'scheduled' });
    });

    it('is idempotent by reference: the SAME idempotencyKey always produces the SAME reference', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(jsonResponse({ data: { id: 'payout-same' } }, 201)),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      const first = await adapter.createPayout(payoutInput);
      const second = await adapter.createPayout(payoutInput);

      const refs = (fetchFn as jest.Mock).mock.calls.map(
        ([, init]: [string, RequestInit]) => JSON.parse(init.body as string).reference,
      );
      expect(refs[0]).toBe(refs[1]);
      expect(first.payoutId).toBe(second.payoutId);
    });

    it("maps a savings/checking account type to Wompi's SAVINGS/CHECKING", async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(jsonResponse({ data: { id: 'payout-1' } }, 201)),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      await adapter.createPayout({
        ...payoutInput,
        bankAccount: { ...bankAccount, accountType: 'checking' },
      });

      const [, init] = (fetchFn as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body as string).bank_account.type).toBe('CHECKING');
    });

    it('throws a clear error when Wompi rejects the payouts call', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(jsonResponse({ error: { messages: {} } }, 422)),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      await expect(adapter.createPayout(payoutInput)).rejects.toThrow(/422/);
    });

    it('an unrecognized/absent created status still means ACCEPTED ⇒ scheduled', async () => {
      const fetchFn = jest.fn<ReturnType<WompiFetch>, Parameters<WompiFetch>>(() =>
        Promise.resolve(jsonResponse({ data: { id: 'payout-1' } }, 201)),
      ) as unknown as WompiFetch;
      const adapter = new WompiPaymentAdapter(makeConfig(), fetchFn);

      const result = await adapter.createPayout(payoutInput);
      expect(result.status).toBe('scheduled');
    });
  });

  describe('verifyAndNormalizePayoutWebhook', () => {
    it('normalizes a VALID checksum to {eventId, payoutId, status, dedupKey}', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const webhook = signedPayoutWebhook({ id: 'payout-1', status: 'PAID' });

      const event = adapter.verifyAndNormalizePayoutWebhook(webhook, '');
      expect(event).toEqual({
        eventId: 'payout-1-PAID',
        payoutId: 'payout-1',
        status: 'paid',
        dedupKey: 'payout-1-PAID',
      });
    });

    it('maps FAILED/REJECTED to our failed status', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const webhook = signedPayoutWebhook({ id: 'payout-1', status: 'REJECTED' });

      expect(adapter.verifyAndNormalizePayoutWebhook(webhook, '').status).toBe('failed');
    });

    it('rejects an INVALID checksum', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const webhook = signedPayoutWebhook({ id: 'payout-1', status: 'PAID' });
      webhook.signature.checksum = 'tampered';

      expect(() => adapter.verifyAndNormalizePayoutWebhook(webhook, '')).toThrow(
        /checksum mismatch/,
      );
    });

    it('rejects a payload missing the signature block', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      expect(() =>
        adapter.verifyAndNormalizePayoutWebhook({ event: 'payout.updated', data: {} }, ''),
      ).toThrow(/missing signature/);
    });

    it('rejects a payload with no payout.id (valid signature over status alone)', () => {
      const adapter = new WompiPaymentAdapter(makeConfig(), jest.fn() as unknown as WompiFetch);
      const properties = ['payout.status'];
      const timestamp = 1_700_000_000;
      const checksum = createHash('sha256')
        .update(`PAID${timestamp}${ENV.WOMPI_EVENTS_SECRET as string}`)
        .digest('hex');
      const webhook = {
        event: 'payout.updated',
        data: { payout: { status: 'PAID' } },
        signature: { properties, checksum },
        timestamp,
      };

      expect(() => adapter.verifyAndNormalizePayoutWebhook(webhook, '')).toThrow(/payout\.id/);
    });
  });
});
