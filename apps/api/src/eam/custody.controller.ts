import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { PRINT_KINDS, RETURN_CONDITIONS, type CustodyService } from '@nexora/domain-eam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Public } from '../auth/auth.guard';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CUSTODY_SERVICE = 'CUSTODY_SERVICE';

const UUID = z.string().uuid();
const issueSchema = z.object({
  employeeId: UUID,
  assetIds: z.array(UUID).min(1).max(100),
  note: z.string().max(500).optional(),
  requestKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/),
});
const returnSchema = z.object({
  items: z
    .array(
      z.object({
        assetId: UUID,
        condition: z.enum(RETURN_CONDITIONS),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const printSchema = z.object({
  custodyId: UUID.optional(),
  assetId: UUID.optional(),
  kind: z.enum(PRINT_KINDS),
});
const detailsSchema = z.object({ location: z.string().max(200).nullable().optional() });

/**
 * EAM-015/016 (Sprint 238) — equipment custody (revers), asset location and
 * QR tokens. Reads need asset.read; issue/return/QR management asset.manage.
 */
@Controller('api/v1/equipment')
export class CustodyController {
  constructor(@Inject(CUSTODY_SERVICE) private readonly custody: CustodyService) {}

  @Get('custody')
  @RequirePermission('asset.read')
  async list(
    @Query('employeeId') employeeId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('assetId') assetId: string | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(
      z.object({
        employeeId: UUID.optional(),
        assetId: UUID.optional(),
        status: z.enum(['OPEN', 'PARTIALLY_RETURNED', 'CLOSED']).optional(),
      }),
      {
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status } : {}),
        ...(assetId ? { assetId } : {}),
      },
    );
    return { custodies: await this.custody.list(q, ctx) };
  }

  @Get('custody/:id')
  @RequirePermission('asset.read')
  async view(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.custody.view(parseBody(UUID, id), ctx);
  }

  @Post('custody')
  @RequirePermission('asset.manage')
  async issue(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.custody.issue(parseBody(issueSchema, body), ctx);
  }

  @Post('custody/:id/return')
  @RequirePermission('asset.manage')
  async return(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(returnSchema, body);
    return this.custody.returnItems({ custodyId: parseBody(UUID, id), ...input }, ctx);
  }

  @Post('print-log')
  @RequirePermission('asset.read')
  async print(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.custody.recordPrint(parseBody(printSchema, body), ctx);
  }

  @Get('assets/:id')
  @RequirePermission('asset.read')
  async asset(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.custody.assetQrView(parseBody(UUID, id), ctx);
  }

  @Post('assets/:id/details')
  @RequirePermission('asset.manage')
  async details(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(detailsSchema, body);
    return this.custody.setAssetDetails(
      { assetId: parseBody(UUID, id), location: input.location },
      ctx,
    );
  }

  @Post('assets/:id/qr')
  @RequirePermission('asset.manage')
  async qr(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ rotate: z.boolean().optional() }), body ?? {});
    return this.custody.issueQrToken(parseBody(UUID, id), ctx, input.rotate === true);
  }

  @Post('assets/:id/qr/revoke')
  @RequirePermission('asset.manage')
  async revoke(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.custody.revokeQrToken(parseBody(UUID, id), ctx);
  }
}

/**
 * EAM-016 — anonymous QR lookup. No login and no tenant from the caller:
 * the unguessable token alone resolves the record, and only non-sensitive
 * fields are returned (no value, serial, notes, internal ids or names).
 */
@Controller('api/v1/public/qr')
@Public()
export class PublicQrController {
  constructor(@Inject(CUSTODY_SERVICE) private readonly custody: CustodyService) {}

  @Get('asset/:token')
  async asset(@Param('token') token: string) {
    return this.custody.publicAsset(token);
  }

  @Get('custody/:token')
  async custodyGroup(@Param('token') token: string) {
    return this.custody.publicCustody(token);
  }
}
