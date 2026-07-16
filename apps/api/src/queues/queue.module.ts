import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseRedisUrl, type Env } from '../config/env.validation';

/** Example queue name. No business jobs are enqueued in Sprint 0. */
export const EXAMPLE_QUEUE = 'example';

/**
 * Wires BullMQ to Redis and registers one empty example queue, establishing the
 * queue infrastructure pattern without any business processors.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: parseRedisUrl(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    BullModule.registerQueue({ name: EXAMPLE_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
