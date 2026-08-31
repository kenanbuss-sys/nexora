import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { FinanceService } from '@nexora/domain-fin';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const FINANCE_SERVICE = 'FINANCE_SERVICE';

const customerInvoiceSchema = z.object({
  orderId: z.string().uuid(),
  dueInDays: z.number().int().min(0).max(365).optional(),
});
const supplierInvoiceSchema = z.object({
  poId: z.string().uuid(),
  dueInDays: z.number().int().min(0).max(365).optional(),
});
const paymentSchema = z.object({
  amount: z.number().positive(),
  reference: z.string().max(200).optional(),
});

@Controller('api/v1/finance')
export class FinanceController {
  constructor(@Inject(FINANCE_SERVICE) private readonly finance: FinanceService) {}

  @Get('invoices')
  @RequirePermission('finance.read')
  async invoices(@Ctx() ctx: RequestContext, @Query('type') type?: string) {
    const params = parseBody(z.object({ type: z.enum(['CUSTOMER', 'SUPPLIER']).optional() }), {
      ...(type ? { type } : {}),
    });
    return { invoices: await this.finance.listInvoices({ invoiceType: params.type }, ctx) };
  }

  @Post('invoices/customer')
  @RequirePermission('finance.invoice')
  async customerInvoice(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.finance.createCustomerInvoice(parseBody(customerInvoiceSchema, body), ctx);
  }

  @Post('invoices/supplier')
  @RequirePermission('finance.invoice')
  async supplierInvoice(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.finance.createSupplierInvoice(parseBody(supplierInvoiceSchema, body), ctx);
  }

  @Get('invoices/:id/payments')
  @RequirePermission('finance.read')
  async payments(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { payments: await this.finance.listPayments(id, ctx) };
  }

  @Post('invoices/:id/payments')
  @RequirePermission('finance.pay')
  async recordPayment(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(paymentSchema, body);
    return this.finance.recordPayment({ invoiceId: id, ...input }, ctx);
  }

  @Get('margin')
  @RequirePermission('finance.read')
  async margin(@Ctx() ctx: RequestContext) {
    return { rows: await this.finance.marginAnalysis(ctx) };
  }

  @Get('pnl')
  @RequirePermission('finance.read')
  async pnl(@Ctx() ctx: RequestContext) {
    return this.finance.pnl(ctx);
  }
}
