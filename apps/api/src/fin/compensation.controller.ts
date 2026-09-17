import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { CompensationService } from '@nexora/domain-fin';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const COMPENSATION_SERVICE = 'COMPENSATION_SERVICE';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lineSchema = z.object({ invoiceId: z.string().uuid(), amount: z.number().positive() });
const draftSchema = z.object({
  legalEntityId: z.string().uuid(),
  partnerId: z.string().uuid(),
  bookingDate: DATE,
  receivables: z.array(lineSchema).min(1).max(100),
  payables: z.array(lineSchema).min(1).max(100),
});
const cancelSchema = z.object({ reason: z.string().min(5).max(400) });

/**
 * FIN-032 (Sprint 214) — compensation. Confirm closes both sides via
 * the FIN-014 payment flow and posts ONE COMPENSATION ledger entry;
 * cancel releases the payments and stornos the entry. All audited.
 */
@Controller('api/v1/compensations')
export class CompensationController {
  constructor(@Inject(COMPENSATION_SERVICE) private readonly comp: CompensationService) {}

  @Get()
  @RequirePermission('finance.read')
  async list(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    const id = parseBody(z.string().uuid(), legalEntityId);
    return { compensations: await this.comp.list(id, ctx) };
  }

  @Get('open-items')
  @RequirePermission('finance.read')
  async openItems(
    @Query('legalEntityId') legalEntityId: string,
    @Query('partnerId') partnerId: string,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(
      z.object({ legalEntityId: z.string().uuid(), partnerId: z.string().uuid() }),
      {
        legalEntityId,
        partnerId,
      },
    );
    return { items: await this.comp.openItems(q, ctx) };
  }

  @Get(':id')
  @RequirePermission('finance.read')
  async view(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.comp.view(id, ctx);
  }

  @Get(':id/document')
  @RequirePermission('finance.read')
  async document(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.comp.document(id, ctx);
  }

  @Post()
  @RequirePermission('finance.pay')
  async createDraft(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.comp.createDraft(parseBody(draftSchema, body), ctx);
  }

  @Post(':id/confirm')
  @RequirePermission('finance.pay')
  async confirm(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.comp.confirm(id, ctx);
  }

  @Post(':id/cancel')
  @RequirePermission('finance.pay')
  async cancel(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(cancelSchema, body);
    return this.comp.cancel(id, input.reason, ctx);
  }
}
