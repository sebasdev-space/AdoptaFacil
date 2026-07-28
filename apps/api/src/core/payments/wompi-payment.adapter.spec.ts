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
});
