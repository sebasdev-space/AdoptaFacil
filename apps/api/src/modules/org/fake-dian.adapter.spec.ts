import { FakeDianAdapter } from './fake-dian.adapter';

describe('FakeDianAdapter', () => {
  it('always succeeds by default (failuresBeforeSuccess=0)', async () => {
    const adapter = new FakeDianAdapter({ latencyMs: 0 });
    const result = await adapter.verifyRteStatus('900123456-7');
    expect(result.verified).toBe(true);
  });

  it('fails the configured number of times before succeeding', async () => {
    const adapter = new FakeDianAdapter({ latencyMs: 0, failuresBeforeSuccess: 2 });
    expect((await adapter.verifyRteStatus('900123456-7')).verified).toBe(false);
    expect((await adapter.verifyRteStatus('900123456-7')).verified).toBe(false);
    expect((await adapter.verifyRteStatus('900123456-7')).verified).toBe(true);
  });

  it('simulates a permanent failure when failuresBeforeSuccess is very high', async () => {
    const adapter = new FakeDianAdapter({ latencyMs: 0, failuresBeforeSuccess: 999 });
    for (let i = 0; i < 5; i += 1) {
      expect((await adapter.verifyRteStatus('900123456-7')).verified).toBe(false);
    }
  });

  it('respects the configured simulated latency', async () => {
    const adapter = new FakeDianAdapter({ latencyMs: 30 });
    const start = performance.now();
    await adapter.verifyRteStatus('900123456-7');
    expect(performance.now() - start).toBeGreaterThanOrEqual(25);
  });

  it('resolves immediately when latencyMs is 0', async () => {
    const adapter = new FakeDianAdapter({ latencyMs: 0 });
    const start = performance.now();
    await adapter.verifyRteStatus('900123456-7');
    expect(performance.now() - start).toBeLessThan(20);
  });
});
