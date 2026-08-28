import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

const up = { ping: async () => undefined };
const down = {
  ping: async () => {
    throw new Error('connection refused');
  },
};
const hang = { ping: () => new Promise<void>(() => undefined) };

describe('HealthService', () => {
  it('reports ok when db and redis are reachable', async () => {
    const report = await new HealthService(up, up).check();
    expect(report.status).toBe('ok');
    expect(report.db).toBe('up');
    expect(report.redis).toBe('up');
  });

  it('reports degraded when a dependency is down, without throwing', async () => {
    const report = await new HealthService(down, up).check();
    expect(report.status).toBe('degraded');
    expect(report.db).toBe('down');
    expect(report.redis).toBe('up');
  });

  it('treats a hanging dependency as down (timeout), not a hung endpoint', async () => {
    const report = await new HealthService(up, hang).check();
    expect(report.status).toBe('degraded');
    expect(report.redis).toBe('down');
  }, 10_000);

  it('isReady is true only when everything is up', async () => {
    expect(await new HealthService(up, up).isReady()).toBe(true);
    expect(await new HealthService(up, down).isReady()).toBe(false);
  });
});
