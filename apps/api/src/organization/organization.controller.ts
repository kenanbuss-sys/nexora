import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { OrganizationService } from '@nexora/domain-core';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ORGANIZATION_SERVICE = 'ORGANIZATION_SERVICE';

const legalEntitySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
});
const businessUnitSchema = z.object({
  legalEntityId: z.string().uuid(),
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional(),
});
const siteSchema = z.object({
  businessUnitId: z.string().uuid(),
  name: z.string().min(1).max(200),
});

@Controller('api/v1/organization')
export class OrganizationController {
  constructor(@Inject(ORGANIZATION_SERVICE) private readonly organization: OrganizationService) {}

  @Get('tree')
  @RequirePermission('organization.read')
  async tree(@Ctx() ctx: RequestContext) {
    return this.organization.getTree(ctx);
  }

  @Post('legal-entities')
  @RequirePermission('organization.manage')
  async createLegalEntity(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.organization.createLegalEntity(parseBody(legalEntitySchema, body), ctx);
  }

  @Post('business-units')
  @RequirePermission('organization.manage')
  async createBusinessUnit(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.organization.createBusinessUnit(parseBody(businessUnitSchema, body), ctx);
  }

  @Post('branches')
  @RequirePermission('organization.manage')
  async createBranch(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.organization.createBranch(parseBody(siteSchema, body), ctx);
  }

  @Post('factories')
  @RequirePermission('organization.manage')
  async createFactory(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.organization.createFactory(parseBody(siteSchema, body), ctx);
  }
}
