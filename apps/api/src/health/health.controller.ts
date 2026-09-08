import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { getCorrelationId } from '@nexora/observability';
import { Public } from '../auth/auth.guard';
import type { HealthReport } from './health.service';
import type { HealthService } from './health.service';

export const HEALTH_SERVICE = 'HEALTH_SERVICE';

@Controller()
@Public()
export class HealthController {
  constructor(@Inject(HEALTH_SERVICE) private readonly health: HealthService) {}

  /** Liveness + dependency overview. Always 200 while the process is alive. */
  @Get('health')
  async getHealth(): Promise<HealthReport & { correlationId: string | undefined }> {
    const report = await this.health.check();
    return { ...report, correlationId: getCorrelationId() };
  }

  /**
   * Status-page hooks (OPS-016): a public, cache-friendly component
   * status any status page can poll — component states only, no
   * internals, no tenant data.
   */
  @Get('status')
  async getStatus(): Promise<{
    status: 'operational' | 'degraded';
    components: Record<string, 'operational' | 'down'>;
    generatedAt: string;
  }> {
    const report = await this.health.check();
    const components: Record<string, 'operational' | 'down'> = {
      api: 'operational',
      database: report.db === 'up' ? 'operational' : 'down',
      queue: report.redis === 'up' ? 'operational' : 'down',
    };
    const degraded = Object.values(components).some((state) => state !== 'operational');
    return {
      status: degraded ? 'degraded' : 'operational',
      components,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Readiness: 200 only when DB and Redis are reachable; 503 otherwise. */
  @Get('ready')
  async getReady(): Promise<{ status: 'ready' }> {
    if (!(await this.health.isReady())) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'A required dependency is unavailable',
        correlationId: getCorrelationId(),
      });
    }
    return { status: 'ready' };
  }
}
