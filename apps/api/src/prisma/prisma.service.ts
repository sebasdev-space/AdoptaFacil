import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Thin wrapper over the generated Prisma client.
 *
 * It also exposes the canonical Row-Level Security helper: `withOrgContext`
 * runs a callback inside a transaction that has `app.current_org_id` set, so
 * RLS policies filter by the active tenant. Every module owner reuses this
 * pattern for their own tenant-scoped tables (see prisma/schema/README).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
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
   * Run `fn` inside a transaction scoped to a single organization.
   * `SET LOCAL` keeps the setting bound to the transaction lifetime, so RLS
   * policies using `current_setting('app.current_org_id')` see the right tenant.
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
