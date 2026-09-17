import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Optional,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { VisionPort } from '@nexora/domain-ai';
import type { BankStatementService } from '@nexora/domain-fin';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const BANK_STATEMENT_SERVICE = 'BANK_STATEMENT_SERVICE';
export const VISION_PORT = 'VISION_PORT';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const importSchema = z.object({
  legalEntityId: z.string().uuid(),
  statementNumber: z.string().min(1).max(60),
  bankAccount: z.string().min(4).max(40),
  statementDate: DATE,
  currency: z.string().length(3),
  openingBalance: z.number(),
  closingBalance: z.number(),
  lineCount: z.number().int().positive(),
  source: z.enum(['MANUAL', 'AI_PROPOSAL']).optional(),
  lines: z
    .array(
      z.object({
        bookingDate: DATE,
        description: z.string().min(1).max(500),
        amount: z.number(),
        reference: z.string().max(100).optional(),
        counterpartyName: z.string().max(200).optional(),
        counterpartyAccount: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(1000),
});
const allocateSchema = z.object({
  statementLineId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  allocationKey: z.string().min(8).max(120),
});
const extractSchema = z.object({
  content: z.string().min(2).max(2_000_000),
  mimeType: z.string().min(3).max(100),
});

/**
 * FIN-030/031 (Sprint 213) — bank statements & closure. Import with
 * control sums, explicit confirmation, partial allocation to invoices
 * through the FIN-014 payment flow; closure never posts to the GL.
 * AI-016: the optional vision extraction returns a PROPOSAL only.
 */
@Controller('api/v1/bank')
export class BankController {
  constructor(
    @Inject(BANK_STATEMENT_SERVICE) private readonly bank: BankStatementService,
    @Optional() @Inject(VISION_PORT) private readonly vision: VisionPort | null,
  ) {}

  @Get('statements')
  @RequirePermission('finance.read')
  async statements(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    const id = parseBody(z.string().uuid(), legalEntityId);
    return { statements: await this.bank.listStatements(id, ctx) };
  }

  @Get('statements/:id')
  @RequirePermission('finance.read')
  async statement(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.bank.statementView(id, ctx);
  }

  @Post('statements')
  @RequirePermission('finance.pay')
  async importStatement(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.bank.importStatement(parseBody(importSchema, body), ctx);
  }

  @Post('statements/:id/confirm')
  @RequirePermission('finance.pay')
  async confirm(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.bank.confirm(id, ctx);
  }

  @Delete('statements/:id')
  @RequirePermission('finance.pay')
  async discard(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.bank.discard(id, ctx);
  }

  @Post('allocations')
  @RequirePermission('finance.pay')
  async allocate(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.bank.allocate(parseBody(allocateSchema, body), ctx);
  }

  @Get('lines/:id/allocations')
  @RequirePermission('finance.read')
  async lineAllocations(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { allocations: await this.bank.lineAllocations(id, ctx) };
  }

  /**
   * AI-016: extract a statement PROPOSAL from a scanned document. The
   * result is never imported automatically — the person reviews it and
   * submits the import explicitly. Without a configured provider the
   * manual flow is unaffected and this endpoint reports it plainly.
   */
  @Post('statements/extract')
  @RequirePermission('finance.pay')
  async extract(@Body() body: unknown) {
    if (!this.vision) {
      throw new DomainError(
        'INVALID_STATE',
        'AI vision provider nije konfigurisan — unesite izvod ručno (ručni tok radi bez AI).',
      );
    }
    const input = parseBody(extractSchema, body);
    return this.vision.extractBankStatement(input);
  }
}
