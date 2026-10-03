import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { CONTRACT_PLACEHOLDERS, type EmploymentContractService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const EMPLOYMENT_CONTRACT_SERVICE = 'EMPLOYMENT_CONTRACT_SERVICE';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const generateSchema = z.object({
  employeeId: z.string().uuid(),
  templateKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  contractType: z.enum(['INDEFINITE', 'FIXED_TERM']),
  startDate: DATE,
  endDate: DATE.optional(),
  position: z.string().max(120).optional(),
  requestKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/),
});
const terminateSchema = z.object({ terminatedOn: DATE, reason: z.string().min(5).max(400) });
const documentSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(3).max(120),
  dataBase64: z.string().min(4),
});

/**
 * HCM-016 (Sprint 236) — employment contracts, expiry alerts and private
 * employee documents. Guard: hcm.read for reads, hcm.manage for contract
 * writes, hcm.docs.read/.manage for documents; salary placeholders and the
 * management lock are enforced in the HCM domain service.
 */
@Controller('api/v1/hcm')
export class EmploymentContractController {
  constructor(
    @Inject(EMPLOYMENT_CONTRACT_SERVICE) private readonly contracts: EmploymentContractService,
  ) {}

  @Get('contracts/placeholders')
  @RequirePermission('hcm.read')
  placeholders() {
    return { placeholders: [...CONTRACT_PLACEHOLDERS] };
  }

  @Get('contracts')
  @RequirePermission('hcm.read')
  async list(@Query('employeeId') employeeId: string | undefined, @Ctx() ctx: RequestContext) {
    const q = parseBody(z.object({ employeeId: z.string().uuid().optional() }), {
      ...(employeeId ? { employeeId } : {}),
    });
    return { contracts: await this.contracts.list(q, ctx) };
  }

  @Get('contracts/expiring')
  @RequirePermission('hcm.read')
  async expiring(
    @Query('days') days: string | undefined,
    @Query('asOf') asOf: string | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(
      z.object({ days: z.coerce.number().int().min(1).max(365).optional(), asOf: DATE.optional() }),
      { ...(days ? { days } : {}), ...(asOf ? { asOf } : {}) },
    );
    return this.contracts.expiring(q, ctx);
  }

  @Post('contracts/expiry-scan')
  @RequirePermission('hcm.manage')
  async scan(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.contracts.scanExpiry(
      parseBody(z.object({ asOf: DATE.optional() }), body ?? {}),
      ctx,
    );
  }

  @Get('contracts/:id')
  @RequirePermission('hcm.read')
  async view(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.contracts.view(parseBody(z.string().uuid(), id), ctx);
  }

  @Post('contracts')
  @RequirePermission('hcm.manage')
  async generate(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.contracts.generate(parseBody(generateSchema, body), ctx);
  }

  @Post('contracts/:id/terminate')
  @RequirePermission('hcm.manage')
  async terminate(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(terminateSchema, body);
    return this.contracts.terminate(
      { contractId: parseBody(z.string().uuid(), id), ...input },
      ctx,
    );
  }

  @Get('employees/:id/documents')
  @RequirePermission('hcm.docs.read')
  async documents(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { documents: await this.contracts.listDocuments(parseBody(z.string().uuid(), id), ctx) };
  }

  @Post('employees/:id/documents')
  @RequirePermission('hcm.docs.manage')
  async upload(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(documentSchema, body);
    return this.contracts.uploadDocument(
      { employeeId: parseBody(z.string().uuid(), id), ...input },
      ctx,
    );
  }

  @Get('documents/:attachmentId')
  @RequirePermission('hcm.docs.read')
  async download(@Param('attachmentId') attachmentId: string, @Ctx() ctx: RequestContext) {
    return this.contracts.downloadDocument(parseBody(z.string().uuid(), attachmentId), ctx);
  }
}
