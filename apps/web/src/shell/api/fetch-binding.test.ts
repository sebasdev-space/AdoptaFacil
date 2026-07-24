import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShellApi } from './create-shell-api';
import { ApiClient } from './api-client';
import { HttpAuthApi } from './auth-api';
import { InMemoryTokenStore } from './token-store';

/**
 * Regression for the auth "Illegal invocation" bug.
 *
 * The default transport used to store a BARE `globalThis.fetch` and later invoke
 * it as a method (`this.fetchFn(...)`). In the browser, `fetch` invoked with a
 * `this` other than the global object throws
 *   TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
 * so login/registro never left the client. The fix binds the DEFAULT fetch to
 * its global receiver; injected fetches (these tests) stay untouched.
 *
 * jsdom/undici do not enforce the receiver, so we install a fetch that mimics
 * the browser: it throws unless called with `this` === globalThis (a plain
 * call in an ES module passes `undefined`, which the spec also allows).
 */
function installBrowserLikeFetch() {
  const strictFetch = function (this: unknown): Promise<Response> {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return Promise.resolve(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
  };
  vi.stubGlobal('fetch', strictFetch as unknown as typeof fetch);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('default fetch is bound to its global receiver (no "Illegal invocation")', () => {
  it('createShellApi http transport can log in', async () => {
    installBrowserLikeFetch();
    const { authApi } = createShellApi({ mode: 'http', baseUrl: 'http://api.test' });
    await expect(
      authApi.login({ email: 'demo@adoptafacil.local', password: 'secret' }),
    ).resolves.toBeDefined();
  });

  it('HttpAuthApi built without an injected fetch can log in', async () => {
    installBrowserLikeFetch();
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore: new InMemoryTokenStore(),
      refreshTokens: async () => {
        throw new Error('unused');
      },
    });
    const authApi = new HttpAuthApi({ baseUrl: 'http://api.test', client });
    await expect(
      authApi.login({ email: 'demo@adoptafacil.local', password: 'secret' }),
    ).resolves.toBeDefined();
  });

  it('ApiClient built without an injected fetch can perform an authenticated request', async () => {
    installBrowserLikeFetch();
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore: new InMemoryTokenStore(),
      refreshTokens: async () => {
        throw new Error('unused');
      },
    });
    await expect(client.request('/rbac/my-roles')).resolves.toBeDefined();
  });
});
