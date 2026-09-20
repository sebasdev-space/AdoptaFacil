import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { computeBreakdown } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { MercadoPagoPaymentAdapter, type MercadoPagoFetch } from './mercadopago-payment.adapter';

const ENV: Record<string, unknown> = {
  MERCADOPAGO_BASE_URL: 'https://api.mercadopago.com',
  MERCADOPAGO_PUBLIC_KEY: 'TEST-pub-dummy',
  MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-dummy',
  MERCADOPAGO_WEBHOOK_SECRET: 'test_webhook_secret_dummy',
  STORAGE_PUBLIC_BASE_URL: 'https://api.adoptafacil.test',
};

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const merged = { ...ENV, ...overrides };
  return { get: (key: string) => merged[key] } as unknown as ConfigService<Env, true>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a VALID MercadoPago `x-signature` header + its manifest ingredients. */
function signWebhook(
  dataId: string,
  requestId: string,
  ts = '1704908010',
  secret = ENV.MERCADOPAGO_WEBHOOK_SECRET as string,
) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return { signature: `ts=${ts},v1=${v1}`, ts, v1, manifest };
}

describe('MercadoPagoPaymentAdapter — createCollection (Fase 1, recaudo)', () => {
  const baseInput = {
    intendedAmount: 50_000,
    currency: 'COP' as const,
    concept: { kind: 'campaign' as const, id: 'campaign-1' },
    commissionPayer: 'organization' as const,
    idempotencyKey: 'idem-abc',
  };

  it('POSTs /checkout/preferences with unit_price in PESOS (never cents) and the correct breakdown', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(
        jsonResponse({ id: 'pref-123', init_point: 'https://mp.test/checkout/pref-123' }, 201),
      ),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(baseInput);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer TEST-token-dummy');

    const body = JSON.parse(init.body as string);
    const expectedBreakdown = computeBreakdown(50_000, 'organization');
    expect(body.items[0].unit_price).toBe(expectedBreakdown.amountCharged);
    expect(body.items[0].currency_id).toBe('COP');
    expect(body.external_reference).toBe('af-idem-abc');
    expect(body.notification_url).toBe('https://api.adoptafacil.test/donations/webhook');

    expect(result).toEqual({
      collectionId: 'af-idem-abc',
      status: 'pending',
      breakdown: expectedBreakdown,
      paymentLinkUrl: 'https://mp.test/checkout/pref-123',
    });
  });

  it("collectionId is OUR OWN reference, never MercadoPago's preference id", async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'pref-999', init_point: 'https://mp.test/x' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(baseInput);

    expect(result.collectionId).not.toBe('pref-999');
    expect(result.collectionId).toBe('af-idem-abc');
  });

  it('falls back to sandbox_init_point when init_point is absent', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(
        jsonResponse({ id: 'pref-1', sandbox_init_point: 'https://mp.test/sandbox/pref-1' }, 201),
      ),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(baseInput);
    expect(result.paymentLinkUrl).toBe('https://mp.test/sandbox/pref-1');
  });

  it('omits notification_url when STORAGE_PUBLIC_BASE_URL is not resolvable', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'pref-1', init_point: 'https://mp.test/x' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig({ STORAGE_PUBLIC_BASE_URL: undefined }),
      fetchFn,
    );

    await adapter.createCollection(baseInput);

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.notification_url).toBeUndefined();
  });

  it('is idempotent by reference: the SAME idempotencyKey always produces the SAME reference', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'pref-same', init_point: 'https://mp.test/x' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const first = await adapter.createCollection(baseInput);
    const second = await adapter.createCollection(baseInput);

    expect(first.collectionId).toBe(second.collectionId);
  });

  it('throws a clear error when MercadoPago rejects the preference call', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ message: 'bad request' }, 400)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.createCollection(baseInput)).rejects.toThrow(/400/);
  });
});

describe('MercadoPagoPaymentAdapter — getCollectionStatus', () => {
  const statusCases: Array<[string, string]> = [
    ['approved', 'approved'],
    ['pending', 'pending'],
    ['authorized', 'pending'],
    ['in_process', 'pending'],
    ['in_mediation', 'pending'],
    ['rejected', 'declined'],
    ['cancelled', 'voided'],
    ['refunded', 'voided'],
    ['charged_back', 'voided'],
    ['something_unknown', 'error'],
  ];

  it.each(statusCases)('maps MercadoPago status "%s" to "%s"', async (raw, expected) => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ results: [{ status: raw }] })),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.getCollectionStatus('af-idem-abc')).resolves.toBe(expected);
  });

  it('returns pending when results is empty (nobody has paid yet)', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ results: [] })),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.getCollectionStatus('af-idem-abc')).resolves.toBe('pending');
  });

  it('queries /v1/payments/search by external_reference', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ results: [] })),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.getCollectionStatus('af-idem-abc');

    const [url] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toContain('/v1/payments/search?external_reference=af-idem-abc');
    expect(url).toContain('sort=date_created');
    expect(url).toContain('criteria=desc');
  });

  it('throws a clear error when the search call fails', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({}, 500)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.getCollectionStatus('af-idem-abc')).rejects.toThrow(/500/);
  });
});

describe('MercadoPagoPaymentAdapter — verifyAndNormalizeWebhook', () => {
  it('accepts a VALID signature and resolves collectionId from external_reference (NOT dataId)', async () => {
    const { signature } = signWebhook('123456789', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ status: 'approved', external_reference: 'af-idem-abc' })),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const event = await adapter.verifyAndNormalizeWebhook({}, signature, {
      headers: { 'x-request-id': 'req-1' },
      query: { 'data.id': '123456789' },
    });

    expect(event).toEqual({
      eventId: '123456789-approved',
      collectionId: 'af-idem-abc',
      status: 'approved',
      dedupKey: '123456789-approved',
    });

    const [url] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments/123456789');
  });

  it('lowercases an alphanumeric data.id when building the manifest', async () => {
    const { signature } = signWebhook('AbC123', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ status: 'approved', external_reference: 'af-x' })),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, {
        headers: { 'x-request-id': 'req-1' },
        query: { 'data.id': 'AbC123' },
      }),
    ).resolves.toMatchObject({ collectionId: 'af-x' });
  });

  it('rejects an INVALID signature (tampered v1)', async () => {
    const { ts } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, `ts=${ts},v1=deadbeef`, {
        headers: { 'x-request-id': 'req-1' },
        query: { 'data.id': '123' },
      }),
    ).rejects.toThrow(/signature mismatch/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects when x-request-id is missing', async () => {
    const { signature } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, { query: { 'data.id': '123' } }),
    ).rejects.toThrow(/missing/);
  });

  it('rejects when data.id is missing from the query', async () => {
    const { signature } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, {
        headers: { 'x-request-id': 'req-1' },
      }),
    ).rejects.toThrow(/missing/);
  });

  it('rejects a signature header missing ts or v1', async () => {
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, 'ts=123', {
        headers: { 'x-request-id': 'req-1' },
        query: { 'data.id': '123' },
      }),
    ).rejects.toThrow(/missing/);
  });

  it('rejects mismatched-length signatures without throwing a Node timingSafeEqual error', async () => {
    const { ts } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, `ts=${ts},v1=ab`, {
        headers: { 'x-request-id': 'req-1' },
        query: { 'data.id': '123' },
      }),
    ).rejects.toThrow(/signature mismatch/);
  });

  it('throws when the payment lookup fails', async () => {
    const { signature } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({}, 404)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, {
        headers: { 'x-request-id': 'req-1' },
        query: { 'data.id': '123' },
      }),
    ).rejects.toThrow(/404/);
  });

  it('throws when the resolved payment has no external_reference', async () => {
    const { signature } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ status: 'approved' })),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, {
        headers: { 'x-request-id': 'req-1' },
        query: { 'data.id': '123' },
      }),
    ).rejects.toThrow(/external_reference/);
  });
});

describe('MercadoPagoPaymentAdapter — Fase 2 (dispersión T+1) not implemented', () => {
  it('createPayout throws "not implemented" (blocked on MercadoPago Disbursements approval)', async () => {
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig(),
      jest.fn() as unknown as MercadoPagoFetch,
    );

    await expect(
      adapter.createPayout({
        beneficiaryOrgId: 'org-1',
        amount: 50_000,
        idempotencyKey: 'payout-1',
        bankAccount: {
          bankCode: '001',
          accountType: 'savings',
          accountNumber: '123',
          accountHolderName: 'Refugio Patitas',
          accountHolderDocument: '900123456-1',
        },
      }),
    ).rejects.toThrow(/not implemented yet \(Fase 2/);
  });

  it('verifyAndNormalizePayoutWebhook throws "not implemented" (blocked on MercadoPago Disbursements approval)', async () => {
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig(),
      jest.fn() as unknown as MercadoPagoFetch,
    );

    await expect(adapter.verifyAndNormalizePayoutWebhook({}, '')).rejects.toThrow(
      /not implemented yet \(Fase 2/,
    );
  });
});
