import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FakePaymentAdapter, type PaymentPort } from '@adoptafacil/contracts';
import { PAYMENT_PORT } from './payment.port';
import { PaymentModule } from './payment.module';
import { WompiPaymentAdapter } from './wompi-payment.adapter';

describe('PaymentModule (T-052)', () => {
  async function resolvePort(): Promise<PaymentPort> {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PaymentModule],
    }).compile();
    return moduleRef.get<PaymentPort>(PAYMENT_PORT);
  }

  /** Isolated env (ignores the real .env) so the wompi-driver test is deterministic. */
  async function resolvePortWithEnv(env: Record<string, string>): Promise<PaymentPort> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
        PaymentModule,
      ],
    }).compile();
    return moduleRef.get<PaymentPort>(PAYMENT_PORT);
  }

  it('binds PAYMENT_PORT to the FakePaymentAdapter imported from contracts', async () => {
    const port = await resolvePort();
    expect(port).toBeInstanceOf(FakePaymentAdapter);
  });

  it('resolves a functional, DETERMINISTIC port (same idempotencyKey → same ids/breakdown)', async () => {
    const port = await resolvePort();
    const input = {
      intendedAmount: 100_000,
      currency: 'COP' as const,
      concept: { kind: 'organization' as const, id: 'org-1' },
      commissionPayer: 'organization' as const,
      idempotencyKey: 'key-abc',
    };

    const a = await port.createCollection(input);
    const b = await port.createCollection(input);
    expect(a.collectionId).toBe(b.collectionId);
    expect(a.status).toBe('approved');
    expect(a.breakdown).toEqual(b.breakdown);

    const bankAccount = {
      bankCode: '001',
      accountType: 'savings' as const,
      accountNumber: '1234567890',
      accountHolderName: 'Refugio Patitas',
      accountHolderDocument: '900123456-1',
    };
    const p1 = await port.createPayout({
      beneficiaryOrgId: 'org-1',
      amount: 50_000,
      idempotencyKey: 'pk',
      bankAccount,
    });
    const p2 = await port.createPayout({
      beneficiaryOrgId: 'org-1',
      amount: 50_000,
      idempotencyKey: 'pk',
      bankAccount,
    });
    expect(p1.payoutId).toBe(p2.payoutId);
    expect(p1.status).toBe('scheduled');
  });

  it('binds PAYMENT_PORT to the WompiPaymentAdapter when PAYMENT_DRIVER=wompi (T-060)', async () => {
    const port = await resolvePortWithEnv({
      PAYMENT_DRIVER: 'wompi',
      WOMPI_BASE_URL: 'https://sandbox.wompi.co/v1',
      WOMPI_PUBLIC_KEY: 'pub_test_dummy',
      WOMPI_PRIVATE_KEY: 'prv_test_dummy',
      WOMPI_EVENTS_SECRET: 'test_events_dummy',
    });
    expect(port).toBeInstanceOf(WompiPaymentAdapter);
  });
});
