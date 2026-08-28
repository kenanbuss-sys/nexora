export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  redis: DependencyStatus;
  uptimeSeconds: number;
}

/** Minimal contracts so the service is testable without real clients. */
export interface DbPinger {
  ping(): Promise<void>;
}
export interface RedisPinger {
  ping(): Promise<void>;
}

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`health check timed out after ${ms}ms`)), ms);
    p.then(
      () => {
        clearTimeout(t);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(t);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly db: DbPinger,
    private readonly redis: RedisPinger,
  ) {}

  async check(): Promise<HealthReport> {
    const [dbResult, redisResult] = await Promise.allSettled([
      withTimeout(this.db.ping(), CHECK_TIMEOUT_MS),
      withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS),
    ]);
    const db: DependencyStatus = dbResult.status === 'fulfilled' ? 'up' : 'down';
    const redis: DependencyStatus = redisResult.status === 'fulfilled' ? 'up' : 'down';
    return {
      status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
      db,
      redis,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  async isReady(): Promise<boolean> {
    const report = await this.check();
    return report.status === 'ok';
  }
}
