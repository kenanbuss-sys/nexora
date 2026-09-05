import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { IntegrationService } from '@nexora/domain-int';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const INTEGRATION_SERVICE = 'INTEGRATION_SERVICE';

const createSubscriptionSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().min(8).max(1000),
  eventTypes: z.array(z.string().min(3).max(100)).min(1).max(50),
});

/** Outbound webhooks: subscriptions, run history, health (Sprint 020). */
@Controller('api/v1/integrations')
export class IntegrationsController {
  constructor(@Inject(INTEGRATION_SERVICE) private readonly integrations: IntegrationService) {}

  @Get('webhooks')
  @RequirePermission('integration.read')
  async list(@Ctx() ctx: RequestContext) {
    return { subscriptions: await this.integrations.listSubscriptions(ctx) };
  }

  @Post('webhooks')
  @RequirePermission('integration.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.integrations.createSubscription(parseBody(createSubscriptionSchema, body), ctx);
  }

  @Post('webhooks/:id/disable')
  @RequirePermission('integration.manage')
  async disable(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.integrations.setSubscriptionActive(id, false, ctx);
    return { ok: true };
  }

  @Post('webhooks/:id/activate')
  @RequirePermission('integration.manage')
  async activate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.integrations.setSubscriptionActive(id, true, ctx);
    return { ok: true };
  }

  @Post('process')
  @RequirePermission('integration.manage')
  async process(@Ctx() ctx: RequestContext) {
    return this.integrations.process(ctx);
  }

  @Get('deliveries')
  @RequirePermission('integration.read')
  async deliveries(
    @Ctx() ctx: RequestContext,
    @Query('subscriptionId') subscriptionId?: string,
    @Query('status') status?: string,
  ) {
    const parsed = parseBody(
      z.object({
        subscriptionId: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'DELIVERED', 'FAILED', 'DEAD']).optional(),
      }),
      { ...(subscriptionId ? { subscriptionId } : {}), ...(status ? { status } : {}) },
    );
    return { deliveries: await this.integrations.listDeliveries(parsed, ctx) };
  }

  @Get('health')
  @RequirePermission('integration.read')
  async health(@Ctx() ctx: RequestContext) {
    return { subscriptions: await this.integrations.health(ctx) };
  }
}
