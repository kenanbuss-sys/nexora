import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { IntegrationService, ConnectorService } from '@nexora/domain-int';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const INTEGRATION_SERVICE = 'INTEGRATION_SERVICE';
export const CONNECTOR_SERVICE = 'CONNECTOR_SERVICE';

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

const previewSchema = z.object({ payload: z.record(z.string(), z.unknown()) });
const pushSchema = z.object({
  objectType: z.string().min(1).max(60),
  objectId: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
});

@Controller('api/v1/connectors')
export class ConnectorsController {
  constructor(@Inject(CONNECTOR_SERVICE) private readonly connectors: ConnectorService) {}

  @Get()
  @RequirePermission('integration.read')
  async list(@Ctx() ctx: RequestContext) {
    return { connectors: await this.connectors.listConnectors(ctx) };
  }

  @Post(':key/import-orders')
  @RequirePermission('integration.manage')
  async importOrders(@Param('key') key: string, @Ctx() ctx: RequestContext) {
    return this.connectors.importMarketplaceOrders(key, ctx);
  }

  @Post('sync-channels')
  @RequirePermission('integration.manage')
  async syncChannels(@Ctx() ctx: RequestContext) {
    return { results: await this.connectors.syncChannels(ctx) };
  }

  @Post(':key/test')
  @RequirePermission('integration.manage')
  async test(@Param('key') key: string, @Ctx() ctx: RequestContext) {
    return this.connectors.testConnection(key, ctx);
  }

  @Post(':key/preview-mapping')
  @RequirePermission('integration.read')
  async previewMapping(
    @Param('key') key: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(previewSchema, body);
    return this.connectors.previewMapping({ key, payload: input.payload }, ctx);
  }

  @Post(':key/push')
  @RequirePermission('integration.manage')
  async push(@Param('key') key: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(pushSchema, body);
    return this.connectors.pushObject({ key, ...input }, ctx);
  }
}
