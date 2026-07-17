import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@adoptafacil/contracts';

/**
 * Holds the active {@link TenantContext} for the lifetime of a single request
 * using an {@link AsyncLocalStorage} store. The tenant middleware calls
 * {@link run} once per request; anything executing within that async chain
 * (controllers, services, {@link PrismaService.withTenant}) can read the tenant
 * back with {@link getOrganizationId}. Outside a request — or for a request that
 * carried no valid tenant — the store is empty.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  /** Run `fn` (and its async continuations) with `context` as the active tenant. */
  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /** The active tenant context, or `undefined` when there is none. */
  get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  /** The active organization id, or `undefined` when there is no tenant context. */
  getOrganizationId(): string | undefined {
    return this.storage.getStore()?.organizationId;
  }
}
