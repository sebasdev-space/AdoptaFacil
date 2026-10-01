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

describe('MercadoPagoPaymentAdapter — createCollection (T-OrdersAPI, Checkout API/Orders)', () => {
  const baseInput = {
    intendedAmount: 50_000,
    currency: 'COP' as const,
    concept: { kind: 'campaign' as const, id: 'campaign-1' },
    commissionPayer: 'organization' as const,
    idempotencyKey: 'idem-abc',
    cardToken: 'card-token-abcdef0123456789',
    paymentMethodId: 'visa',
  };

  it('POSTs /v1/orders with amounts as STRINGS in pesos and the correct breakdown', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-123', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(baseInput);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer TEST-token-dummy');
    // Regression (live 2026-09-30: 400 empty_required_header without this) —
    // /v1/orders rejects the request outright when it's missing.
    expect(init.headers['X-Idempotency-Key']).toBe('idem-abc');

    const body = JSON.parse(init.body as string);
    const expectedBreakdown = computeBreakdown(50_000, 'organization');
    expect(body.type).toBe('online');
    expect(body.external_reference).toBe('af-idem-abc');
    expect(body.total_amount).toBe(String(expectedBreakdown.amountCharged));
    expect(body.transactions.payments[0]).toEqual({
      amount: String(expectedBreakdown.amountCharged),
      payment_method: {
        id: 'visa',
        type: 'credit_card',
        token: 'card-token-abcdef0123456789',
        installments: 1,
      },
    });
    expect(body.processing_mode).toBe('automatic');
    expect(body.integration_data).toBeUndefined();
    expect(body.back_urls).toBeUndefined();
    expect(body.auto_return).toBeUndefined();
    expect(body.notification_url).toBeUndefined();

    expect(result).toEqual({
      collectionId: 'af-idem-abc',
      status: 'approved',
      breakdown: expectedBreakdown,
    });
    expect(result.paymentLinkUrl).toBeUndefined();
  });

  it("collectionId is OUR OWN reference, never MercadoPago's order id", async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-999', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(baseInput);

    expect(result.collectionId).not.toBe('ORD-999');
    expect(result.collectionId).toBe('af-idem-abc');
  });

  it('includes payment_method_type when supplied, defaults to credit_card otherwise', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection({ ...baseInput, paymentMethodType: 'debit_card' });

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.transactions.payments[0].payment_method.type).toBe('debit_card');
  });

  it("infers type=debit_card from the Brick's 'deb'-prefixed id WITHOUT altering the id itself (regression: live 400 property_value, 2026-10-01 — Orders API rejected 'debmaster' paired with type=credit_card, AND separately rejected a stripped 'master' paired with type=debit_card; id+type must be MercadoPago's own matched pair, untouched)", async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection({ ...baseInput, paymentMethodId: 'debmaster' });

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.transactions.payments[0].payment_method.id).toBe('debmaster');
    expect(body.transactions.payments[0].payment_method.type).toBe('debit_card');
  });

  it('an explicit paymentMethodType overrides the prefix-derived default (id is still never altered)', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection({
      ...baseInput,
      paymentMethodId: 'debvisa',
      paymentMethodType: 'credit_card',
    });

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.transactions.payments[0].payment_method.id).toBe('debvisa');
    expect(body.transactions.payments[0].payment_method.type).toBe('credit_card');
  });

  it('includes installments from input, defaults to 1', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection({ ...baseInput, installments: 6 });

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.transactions.payments[0].payment_method.installments).toBe(6);
  });

  it('includes payer.email when supplied', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection({ ...baseInput, payer: { email: 'donante@test.local' } });

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.payer).toEqual({ email: 'donante@test.local' });
  });

  it('Split de Pagos 1:1 — includes integration_data.sponsor.id ONLY when sponsorMpUserId is present', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection({ ...baseInput, sponsorMpUserId: 'mp-user-999' });

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.integration_data).toEqual({ sponsor: { id: 'mp-user-999' } });
  });

  it('omits integration_data entirely when sponsorMpUserId is absent', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-1', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await adapter.createCollection(baseInput);

    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.integration_data).toBeUndefined();
  });

  it('maps the order create-response status (processed/failed/pending) to PaymentStatus', async () => {
    const cases: Array<[string, string]> = [
      ['processed', 'approved'],
      ['failed', 'declined'],
      ['pending', 'pending'],
      ['action_required', 'pending'],
      ['canceled', 'voided'],
      ['something_unknown', 'error'],
    ];
    for (const [raw, expected] of cases) {
      const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
        Promise.resolve(jsonResponse({ id: 'ORD-1', status: raw }, 201)),
      ) as unknown as MercadoPagoFetch;
      const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

      const result = await adapter.createCollection(baseInput);
      expect(result.status).toBe(expected);
    }
  });

  it('is idempotent by reference: the SAME idempotencyKey always produces the SAME reference', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: 'ORD-same', status: 'processed' }, 201)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const first = await adapter.createCollection(baseInput);
    const second = await adapter.createCollection(baseInput);

    expect(first.collectionId).toBe(second.collectionId);
  });

  it('throws a clear error when MercadoPago rejects the order call', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ message: 'bad request' }, 400)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.createCollection(baseInput)).rejects.toThrow(/400/);
  });

  it(
    'a card decline (402, rejected_by_issuer) resolves as a normal declined result instead ' +
      'of throwing (regression: live 2026-10-01 — a real debit card got rejected by the ' +
      'issuer and MercadoPago answered 402 with the order wrapped under `data`, not thrown ' +
      'to the caller as an integration failure)',
    async () => {
      const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
        Promise.resolve(
          jsonResponse(
            {
              errors: [{ code: 'failed', message: 'The following transactions failed' }],
              data: { id: 'ORD-1', status: 'failed', external_reference: 'af-idem-abc' },
            },
            402,
          ),
        ),
      ) as unknown as MercadoPagoFetch;
      const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

      const result = await adapter.createCollection(baseInput);

      expect(result.status).toBe('declined');
      expect(result.collectionId).toBe('af-idem-abc');
    },
  );

  it('still throws on a non-2xx response with no usable order under `data` (a genuine structural error)', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ errors: [{ code: 'empty_required_header' }] }, 400)),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    await expect(adapter.createCollection(baseInput)).rejects.toThrow(/400/);
  });

  it('throws without ever calling the gateway when cardToken is missing', async () => {
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const { cardToken: _omit, ...withoutToken } = baseInput;
    await expect(adapter.createCollection(withoutToken)).rejects.toThrow(/tokenized card/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws without ever calling the gateway when paymentMethodId is missing', async () => {
    const fetchFn = jest.fn() as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const { paymentMethodId: _omit, ...withoutMethod } = baseInput;
    await expect(adapter.createCollection(withoutMethod)).rejects.toThrow(/tokenized card/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoPaymentAdapter — getCollectionStatus (unchanged — /v1/payments/search)', () => {
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

describe('MercadoPagoPaymentAdapter — verifyAndNormalizeWebhook (T-OrdersAPI, GET /v1/orders/:id)', () => {
  it('accepts a VALID signature and resolves collectionId from external_reference (NOT dataId)', async () => {
    const { signature } = signWebhook('ORD123456789', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(
        jsonResponse({
          id: 'ORD123456789',
          status: 'processed',
          external_reference: 'af-idem-abc',
        }),
      ),
    ) as unknown as MercadoPagoFetch;
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);

    const event = await adapter.verifyAndNormalizeWebhook({}, signature, {
      headers: { 'x-request-id': 'req-1' },
      query: { 'data.id': 'ORD123456789' },
    });

    expect(event).toEqual({
      eventId: 'ORD123456789-processed',
      collectionId: 'af-idem-abc',
      status: 'approved',
      dedupKey: 'ORD123456789-processed',
    });

    const [url] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/orders/ORD123456789');
  });

  it('lowercases an alphanumeric data.id when building the manifest', async () => {
    const { signature } = signWebhook('AbC123', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(
        jsonResponse({ id: 'AbC123', status: 'processed', external_reference: 'af-x' }),
      ),
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

  it('throws when the order lookup fails', async () => {
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

  it('throws when the resolved order has no external_reference', async () => {
    const { signature } = signWebhook('123', 'req-1');
    const fetchFn = jest.fn<ReturnType<MercadoPagoFetch>, Parameters<MercadoPagoFetch>>(() =>
      Promise.resolve(jsonResponse({ id: '123', status: 'processed' })),
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
