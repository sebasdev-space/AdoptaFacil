import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextService } from '../core/tenant/tenant-context.service';

/**
 * Resolve the connection string for the application runtime. The app connects
 * as the NON-SUPERUSER `adoptafacil_app` role (DATABASE_URL_APP) so Row-Level
 * Security is actually enforced — a superuser would bypass RLS entirely.
 * Migrations are a separate concern and keep using DATABASE_URL (superuser) via
 * the Prisma CLI.
 */
function resolveAppDatabaseUrl(): string {
  const appUrl = process.env.DATABASE_URL_APP;
  if (!appUrl) {
    throw new Error(
      'DATABASE_URL_APP is not set. The API must connect as the non-superuser ' +
        'adoptafacil_app role so Row-Level Security is enforced (RNF03). ' +
        'Run `pnpm setup:env` or provide DATABASE_URL_APP.',
    );
  }
  return appUrl;
}

/**
 * Thin wrapper over the generated Prisma client, connected as the tenant-scoped
 * application role. It exposes the canonical Row-Level Security helpers:
 *
 * - {@link withTenant} — the everyday accessor: runs a callback inside a
 *   transaction bound to the CURRENT request's organization (from
 *   {@link TenantContextService}). This is how business code touches tenant
 *   data; it rejects when there is no tenant context.
 * - {@link withOrgContext} — the explicit form used by seeds/tests/jobs that
 *   name the organization directly (no request in scope).
 *
 * Either way the query runs with `app.current_org_id` set, so RLS filters by the
 * active tenant. Because the app is a non-superuser with FORCE RLS on every
 * business table, a query that somehow escapes these helpers simply sees zero
 * rows instead of leaking across tenants.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly tenant: TenantContextService) {
    super({ datasources: { db: { url: resolveAppDatabaseUrl() } } });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL as the application role');
    } catch (error) {
      // Walking-skeleton resilience: boot even if the DB is not up yet so
      // /health can report db="down" instead of crashing the process.
      this.logger.warn(`Could not connect to PostgreSQL on boot: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap liveness probe used by the health endpoint. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run `fn` inside a transaction scoped to the CURRENT request's organization.
   * Reads the tenant from {@link TenantContextService}; throws
   * `ForbiddenException` when the request carried no valid tenant context (so
   * business endpoints cannot read data without one). This is the accessor
   * business code should use.
   */
  async withTenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context: request has no organization');
    }
    return this.withOrgContext(organizationId, fn);
  }

  /**
   * Run `fn` inside a transaction scoped to an explicit organization.
   * `SET LOCAL` (via `set_config(..., true)`) keeps the setting bound to the
   * transaction lifetime, so RLS policies using
   * `current_setting('app.current_org_id')` see the right tenant and the value
   * is reset automatically when the transaction ends.
   */
  async withOrgContext<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx: Prisma.TransactionClient) => {
      // set_config(name, value, is_local=true) is injection-safe (parameterized).
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }
}
