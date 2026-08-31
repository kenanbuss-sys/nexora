import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { PortalService } from '@nexora/domain-b2b';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PORTAL_SERVICE = 'PORTAL_SERVICE';

const addPortalUserSchema = z.object({
  accountId: z.string().uuid(),
  idpSubject: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  email: z.string().email().optional(),
});

/** Back-office management of portal users. */
@Controller('api/v1/portal-users')
export class PortalUsersController {
  constructor(@Inject(PORTAL_SERVICE) private readonly portal: PortalService) {}

  @Get()
  @RequirePermission('portal.manage')
  async list(@Ctx() ctx: RequestContext) {
    return { portalUsers: await this.portal.listPortalUsers(ctx) };
  }

  @Post()
  @RequirePermission('portal.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.portal.addPortalUser(parseBody(addPortalUserSchema, body), ctx);
  }

  @Post(':id/disable')
  @RequirePermission('portal.manage')
  async disable(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.portal.setPortalUserStatus(id, 'DISABLED', ctx);
    return { ok: true };
  }

  @Post(':id/activate')
  @RequirePermission('portal.manage')
  async activate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.portal.setPortalUserStatus(id, 'ACTIVE', ctx);
    return { ok: true };
  }
}

/** Customer self-service: everything scoped to the caller's account. */
@Controller('api/v1/portal')
export class PortalController {
  constructor(@Inject(PORTAL_SERVICE) private readonly portal: PortalService) {}

  @Get('me')
  @RequirePermission('portal.access')
  async me(@Ctx() ctx: RequestContext) {
    const context = await this.portal.resolvePortalContext(ctx);
    const credit = await this.portal.myCredit(ctx);
    return { ...context, credit };
  }

  @Get('orders')
  @RequirePermission('portal.access')
  async orders(@Ctx() ctx: RequestContext) {
    return { orders: await this.portal.myOrders(ctx) };
  }

  @Get('orders/:id/timeline')
  @RequirePermission('portal.access')
  async timeline(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { events: await this.portal.myOrderTimeline(id, ctx) };
  }

  @Get('quotes')
  @RequirePermission('portal.access')
  async quotes(@Ctx() ctx: RequestContext) {
    return { quotes: await this.portal.myQuotes(ctx) };
  }

  @Get('invoices')
  @RequirePermission('portal.access')
  async invoices(@Ctx() ctx: RequestContext) {
    return { invoices: await this.portal.myInvoices(ctx) };
  }
}
