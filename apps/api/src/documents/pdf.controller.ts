import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { PdfService } from '@nexora/domain-doc';
import type { RequestContext } from '@nexora/tenancy';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';

export const PDF_SERVICE = 'PDF_SERVICE';

/** Business document rendering (DOC-002): quote, invoice, delivery note. */
@Controller('api/v1/documents')
export class PdfController {
  constructor(@Inject(PDF_SERVICE) private readonly pdf: PdfService) {}

  @Get('quote/:id/pdf')
  @RequirePermission('quote.read')
  async quote(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.pdf.renderQuote(id, ctx);
  }

  @Get('invoice/:id/pdf')
  @RequirePermission('finance.read')
  async invoice(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.pdf.renderInvoice(id, ctx);
  }

  @Get('delivery-note/:id/pdf')
  @RequirePermission('order.read')
  async deliveryNote(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.pdf.renderDeliveryNote(id, ctx);
  }
}
