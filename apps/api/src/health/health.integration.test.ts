import { createDb, type PrismaClient } from '@nexora/db';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

/**
 * Integration test against real PostgreSQL and Redis
 * (docs/operations/02_TESTING_STRATEGY.md). Runs only when INTEGRATION=1.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

integration('HealthService (integration, real PostgreSQL + Redis)', () => {
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(() => {
    prisma = createDb({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os',
      max: 2,
    });
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  it('reports ok against live dependencies', async () => {
    const service = new HealthService(
      {
        ping: async () => {
          await prisma.$queryRaw`SELECT 1`;
        },
      },
      {
        ping: async () => {
          await redis.ping();
        },
      },
    );
    const report = await service.check();
    expect(report).toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
  });
});
