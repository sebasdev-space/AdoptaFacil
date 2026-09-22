import { describe, expect, it } from 'vitest';
import { FakeIdentityAdapter } from '../src/identity';

describe('FakeIdentityAdapter — "fake:<email>:<name>" format', () => {
  it('parses the primary format and normalizes the email', () => {
    const adapter = new FakeIdentityAdapter();
    const claims = adapter.verifyGoogleIdToken('fake:Jane@Example.com:Jane Doe');
    return claims.then((c) => {
      expect(c.email).toBe('jane@example.com');
      expect(c.name).toBe('Jane Doe');
      expect(c.emailVerified).toBe(true);
      expect(c.sub).toMatch(/^fake-[0-9a-f]{8}$/);
    });
  });

  it('is deterministic: the same email always yields the same sub', async () => {
    const adapter = new FakeIdentityAdapter();
    const a = await adapter.verifyGoogleIdToken('fake:jane@example.com:Jane Doe');
    const b = await adapter.verifyGoogleIdToken('fake:jane@example.com:A Different Name');
    expect(a.sub).toBe(b.sub);
  });

  it('rejects a malformed fake token (missing the name segment)', async () => {
    const adapter = new FakeIdentityAdapter();
    await expect(adapter.verifyGoogleIdToken('fake:jane@example.com')).rejects.toThrow();
  });

  it('rejects an empty email or name', async () => {
    const adapter = new FakeIdentityAdapter();
    await expect(adapter.verifyGoogleIdToken('fake::Jane Doe')).rejects.toThrow();
    await expect(adapter.verifyGoogleIdToken('fake:jane@example.com:')).rejects.toThrow();
  });
});

describe('FakeIdentityAdapter — base64url JSON alternate format', () => {
  function encode(payload: unknown): string {
    const json = JSON.stringify(payload);
    // Mirror the browser-safe base64url the adapter decodes — no Buffer/btoa
    // needed here since Node's test runner has both, but keep this test
    // environment-agnostic by hand-rolling the same alphabet the adapter uses.
    return Buffer.from(json, 'utf8').toString('base64url');
  }

  it('parses an explicit { email, name, sub, emailVerified } payload', async () => {
    const adapter = new FakeIdentityAdapter();
    const token = encode({
      email: 'Carlos@Example.com',
      name: 'Carlos Pérez',
      sub: 'google-sub-123',
      emailVerified: false,
    });
    const claims = await adapter.verifyGoogleIdToken(token);
    expect(claims.email).toBe('carlos@example.com');
    expect(claims.name).toBe('Carlos Pérez');
    expect(claims.sub).toBe('google-sub-123');
    expect(claims.emailVerified).toBe(false);
  });

  it('defaults emailVerified to true and derives sub when both are omitted', async () => {
    const adapter = new FakeIdentityAdapter();
    const token = encode({ email: 'sin-sub@example.com', name: 'Sin Sub' });
    const claims = await adapter.verifyGoogleIdToken(token);
    expect(claims.emailVerified).toBe(true);
    expect(claims.sub).toMatch(/^fake-[0-9a-f]{8}$/);
  });

  it('rejects a payload missing email/name', async () => {
    const adapter = new FakeIdentityAdapter();
    const token = encode({ sub: 'x' });
    await expect(adapter.verifyGoogleIdToken(token)).rejects.toThrow();
  });
});

describe('FakeIdentityAdapter — invalid input', () => {
  it('rejects a token that matches neither documented format', async () => {
    const adapter = new FakeIdentityAdapter();
    await expect(adapter.verifyGoogleIdToken('not-a-real-token')).rejects.toThrow();
  });
});
