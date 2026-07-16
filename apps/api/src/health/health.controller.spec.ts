import { Test } from '@nestjs/testing';
import type { HealthStatus } from '@adoptafacil/contracts';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('returns the status produced by HealthService', async () => {
    const expected: HealthStatus = { status: 'ok', db: 'up', redis: 'up' };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { check: jest.fn().mockResolvedValue(expected) } },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.check()).resolves.toEqual(expected);
  });
});
