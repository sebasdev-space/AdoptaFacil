import type { DianPort, DianVerificationResult } from './dian.port';

export interface FakeDianAdapterOptions {
  /** Simulated network latency before resolving (ms). Default: small, so unit/
   *  integration tests stay fast; never real DIAN response times (there are
   *  none — see DianPort's TODO(client)). */
  latencyMs?: number;
  /** How many of the NEXT calls fail before the call finally succeeds. `0`
   *  (default) always succeeds — a value `>=` the retry ladder's total
   *  attempts simulates a permanent failure (every attempt exhausted). */
  failuresBeforeSuccess?: number;
}

/**
 * The ONLY DianPort adapter (S-2) — there is no real DIAN API to integrate
 * with (documento base: "DIAN: SIN API"). Deterministic and constructor-
 * configurable so tests can force a specific number of failures instead of
 * relying on randomness; local/dev usage can still read `DIAN_FAKE_*` env
 * vars (wired in org.module.ts) to casually observe the retry flow.
 */
export class FakeDianAdapter implements DianPort {
  private callCount = 0;

  constructor(private readonly options: FakeDianAdapterOptions = {}) {}

  async verifyRteStatus(_nit: string): Promise<DianVerificationResult> {
    const latencyMs = this.options.latencyMs ?? 50;
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
    this.callCount += 1;
    const failuresBeforeSuccess = this.options.failuresBeforeSuccess ?? 0;
    return { verified: this.callCount > failuresBeforeSuccess };
  }
}
