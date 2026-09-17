import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { GL_ENTRY_TYPES, type LedgerReportService, type LedgerService } from '@nexora/domain-fin';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const LEDGER_SERVICE = 'LEDGER_SERVICE';
export const LEDGER_REPORT_SERVICE = 'LEDGER_REPORT_SERVICE';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountSchema = z.object({
  legalEntityId: z.string().uuid(),
  code: z.string().regex(/^\d{8}$/),
  name: z.string().min(1).max(200),
  partnerId: z.string().uuid().optional(),
});
const copySchema = z.object({ targetLegalEntityId: z.string().uuid() });
const activeSchema = z.object({ active: z.boolean() });
const partnerAccountSchema = z.object({
  legalEntityId: z.string().uuid(),
  partnerId: z.string().uuid(),
  side: z.enum(['supplier', 'customer']),
  partnerName: z.string().min(1).max(200),
  prefix: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
const systemAccountSchema = z.object({
  legalEntityId: z.string().uuid(),
  roleKey: z.string().min(2).max(60),
  accountId: z.string().uuid(),
});
const openingSchema = z.object({ legalEntityId: z.string().uuid(), openingDate: DATE });
const lockSchema = z.object({ legalEntityId: z.string().uuid(), lockedThrough: DATE });
const draftSchema = z.object({
  legalEntityId: z.string().uuid(),
  entryType: z.enum(GL_ENTRY_TYPES),
  bookingDate: DATE,
  description: z.string().min(1).max(500),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debit: z.number().nonnegative(),
        credit: z.number().nonnegative(),
        partnerId: z.string().uuid().optional(),
      }),
    )
    .min(2)
    .max(200),
});
const stornoSchema = z.object({ reason: z.string().min(5).max(400) });

/**
 * FIN-023/024/025/026 (Sprint 211) — general-ledger core. Permissions
 * are per-user finance permissions, never roles alone.
 */
@Controller('api/v1/ledger')
export class LedgerController {
  constructor(@Inject(LEDGER_SERVICE) private readonly ledger: LedgerService) {}

  @Get('accounts')
  @RequirePermission('finance.ledger.read')
  async accounts(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    const id = parseBody(z.string().uuid(), legalEntityId);
    return { accounts: await this.ledger.listAccounts(id, ctx) };
  }

  @Post('accounts')
  @RequirePermission('finance.ledger.manage')
  async createAccount(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ledger.createAccount(parseBody(accountSchema, body), ctx);
  }

  @Post('accounts/:id/copy')
  @RequirePermission('finance.ledger.manage')
  async copyAccount(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(copySchema, body);
    return this.ledger.copyAccount(
      { accountId: id, targetLegalEntityId: input.targetLegalEntityId },
      ctx,
    );
  }

  @Post('accounts/:id/active')
  @RequirePermission('finance.ledger.manage')
  async setActive(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(activeSchema, body);
    return this.ledger.setAccountActive(id, input.active, ctx);
  }

  @Post('accounts/partner')
  @RequirePermission('finance.ledger.manage')
  async ensurePartnerAccount(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ledger.ensurePartnerAccount(parseBody(partnerAccountSchema, body), ctx);
  }

  @Post('system-accounts')
  @RequirePermission('finance.ledger.manage')
  async setSystemAccount(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ledger.setSystemAccount(parseBody(systemAccountSchema, body), ctx);
  }

  @Get('system-accounts')
  @RequirePermission('finance.ledger.read')
  async systemAccounts(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    const id = parseBody(z.string().uuid(), legalEntityId);
    return { systemAccounts: await this.ledger.systemAccounts(id, ctx) };
  }

  @Post('control/opening-date')
  @RequirePermission('finance.ledger.manage')
  async setOpeningDate(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ledger.setOpeningDate(parseBody(openingSchema, body), ctx);
  }

  @Post('control/period-lock')
  @RequirePermission('finance.ledger.manage')
  async setPeriodLock(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ledger.setPeriodLock(parseBody(lockSchema, body), ctx);
  }

  @Get('control')
  @RequirePermission('finance.ledger.read')
  async control(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    const id = parseBody(z.string().uuid(), legalEntityId);
    return this.ledger.ledgerControl(id, ctx);
  }

  @Get('entries')
  @RequirePermission('finance.ledger.read')
  async entries(
    @Ctx() ctx: RequestContext,
    @Query('legalEntityId') legalEntityId: string,
    @Query('status') status?: string,
  ) {
    const id = parseBody(z.string().uuid(), legalEntityId);
    return { entries: await this.ledger.listEntries({ legalEntityId: id, status }, ctx) };
  }

  @Get('entries/:id')
  @RequirePermission('finance.ledger.read')
  async entry(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.ledger.entryView(id, ctx);
  }

  @Post('entries')
  @RequirePermission('finance.ledger.post')
  async createDraft(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ledger.createDraft(parseBody(draftSchema, body), ctx);
  }

  @Delete('entries/:id')
  @RequirePermission('finance.ledger.post')
  async deleteDraft(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.ledger.deleteDraft(id, ctx);
  }

  @Post('entries/:id/post')
  @RequirePermission('finance.ledger.post')
  async post(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.ledger.post(id, ctx);
  }

  @Post('entries/:id/storno')
  @RequirePermission('finance.ledger.post')
  async storno(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(stornoSchema, body);
    return this.ledger.storno(id, input.reason, ctx);
  }
}

/**
 * FIN-027/029 (Sprint 212) — read-only ledger reports: account and
 * partner cards, trial balance. Reports never mutate the ledger.
 */
@Controller('api/v1/ledger/reports')
export class LedgerReportsController {
  constructor(@Inject(LEDGER_REPORT_SERVICE) private readonly reports: LedgerReportService) {}

  @Get('account-card')
  @RequirePermission('finance.ledger.read')
  async accountCard(
    @Ctx() ctx: RequestContext,
    @Query('legalEntityId') legalEntityId: string,
    @Query('accountId') accountId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('includeStorno') includeStorno?: string,
  ) {
    const q = parseBody(
      z.object({
        legalEntityId: z.string().uuid(),
        accountId: z.string().uuid(),
        from: DATE,
        to: DATE,
      }),
      { legalEntityId, accountId, from, to },
    );
    return this.reports.accountCard({ ...q, includeStorno: includeStorno === 'true' }, ctx);
  }

  @Get('partner-card')
  @RequirePermission('finance.ledger.read')
  async partnerCard(
    @Ctx() ctx: RequestContext,
    @Query('legalEntityId') legalEntityId: string,
    @Query('partnerId') partnerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('includeStorno') includeStorno?: string,
  ) {
    const q = parseBody(
      z.object({
        legalEntityId: z.string().uuid(),
        partnerId: z.string().uuid(),
        from: DATE,
        to: DATE,
      }),
      { legalEntityId, partnerId, from, to },
    );
    return this.reports.partnerCard({ ...q, includeStorno: includeStorno === 'true' }, ctx);
  }

  @Get('trial-balance')
  @RequirePermission('finance.ledger.read')
  async trialBalance(
    @Ctx() ctx: RequestContext,
    @Query('legalEntityId') legalEntityId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const q = parseBody(z.object({ legalEntityId: z.string().uuid(), from: DATE, to: DATE }), {
      legalEntityId,
      from,
      to,
    });
    return this.reports.trialBalance(q, ctx);
  }
}
