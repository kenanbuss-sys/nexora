import Redis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

/**
 * Integration test against real PostgreSQL and Redis
 * (docs/operations/02_TESTING_STRATEGY.md: real DB/Redis integration tests).
 * Runs only when INTEGRATION=1 (CI provides service containers).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

integration('HealthService (integration, real PostgreSQL + Redis)', () => {
  let pool: Pool;
  let redis: Redis;

  beforeAll(() => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os',
      connectionTimeoutMillis: 2_000,
    });
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
    });
  });

  afterAll(async () => {
    await pool.end();
    redis.disconnect();
  });

  it('reports ok against live dependencies', async () => {
    const service = new HealthService(
      {
        ping: async () => {
          await pool.query('SELECT 1');
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
