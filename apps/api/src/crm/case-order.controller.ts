import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import type { CaseOrderService } from '@nexora/domain-crm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CASE_ORDER_SERVICE = 'CASE_ORDER_SERVICE';

const linkOrderSchema = z.object({ orderId: z.string().uuid() });
const itemsSchema = z.object({
  items: z
    .array(
      z.object({
        orderLineId: z.string().uuid(),
        quantity: z.number().positive(),
        issueType: z.string().min(2).max(40),
        note: z.string().max(500).optional(),
      }),
    )
    .max(100),
});
const openReturnSchema = z.object({
  requestKey: z.string().min(8).max(128),
  reason: z.string().max(500).optional(),
});

/** CSM-011: case <-> order context, affected lines and returns from a case. */
@Controller('api/v1/support-cases')
export class CaseOrderController {
  constructor(@Inject(CASE_ORDER_SERVICE) private readonly caseOrders: CaseOrderService) {}

  @Get('by-order/:orderId')
  @RequirePermission('crm.read')
  async byOrder(@Param('orderId') orderId: string, @Ctx() ctx: RequestContext) {
    return { cases: await this.caseOrders.casesForOrder(orderId, ctx) };
  }

  @Post(':id/order')
  @RequirePermission('crm.manage')
  async linkOrder(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.caseOrders.linkOrder(id, parseBody(linkOrderSchema, body).orderId, ctx);
  }

  @Put(':id/order-items')
  @RequirePermission('crm.manage')
  async setItems(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return { items: await this.caseOrders.setItems(id, parseBody(itemsSchema, body).items, ctx) };
  }

  @Get(':id/order-context')
  @RequirePermission('crm.read')
  async context(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.caseOrders.context(id, ctx);
  }

  /** Opening an RMA is an order-domain action: it needs the return permission. */
  @Post(':id/returns')
  @RequirePermission('order.return')
  async openReturn(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.caseOrders.openReturn(id, parseBody(openReturnSchema, body), ctx);
  }
}
