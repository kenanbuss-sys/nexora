import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { ReturnsService } from '@nexora/domain-oms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const RETURNS_SERVICE = 'RETURNS_SERVICE';

const requestReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(3).max(500),
  lines: z
    .array(z.object({ orderLineId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1)
    .max(50),
});
const decideSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

/** Returns orchestration (OMS-012/COM-011). */
@Controller('api/v1/returns')
export class ReturnsController {
  constructor(@Inject(RETURNS_SERVICE) private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermission('order.read')
  async list(@Ctx() ctx: RequestContext) {
    return { returns: await this.returns.listReturns(ctx) };
  }

  @Post()
  @RequirePermission('order.return')
  async request(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.returns.requestReturn(parseBody(requestReturnSchema, body), ctx);
  }

  @Post(':id/decide')
  @RequirePermission('order.return')
  async decide(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.returns.decideReturn(id, parseBody(decideSchema, body), ctx);
  }

  @Post(':id/receive')
  @RequirePermission('order.return')
  async receive(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.returns.receiveReturn(id, ctx);
  }
}
