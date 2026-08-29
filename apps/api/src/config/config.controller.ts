import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import type { ConfigurationService } from '@nexora/domain-core';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CONFIGURATION_SERVICE = 'CONFIGURATION_SERVICE';

const terminologySchema = z.object({
  entries: z.record(z.string().min(2).max(100), z.string().min(1).max(200)),
});
const moduleSchema = z.object({ enabled: z.boolean() });
const customFieldSchema = z.object({
  objectType: z.string().min(2).max(64),
  key: z.string().min(2).max(100),
  label: z.string().min(1).max(200),
  fieldType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'JSON']),
  required: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

@Controller('api/v1/configuration')
export class ConfigController {
  constructor(
    @Inject(CONFIGURATION_SERVICE) private readonly configuration: ConfigurationService,
  ) {}

  @Get('terminology/:locale')
  @RequirePermission('configuration.read')
  async getTerminology(@Param('locale') locale: string, @Ctx() ctx: RequestContext) {
    return { locale, entries: await this.configuration.getTerminology(locale, ctx) };
  }

  @Put('terminology/:locale')
  @RequirePermission('configuration.publish')
  async setTerminology(
    @Param('locale') locale: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(terminologySchema, body);
    return this.configuration.setTerminology(locale, input.entries, ctx);
  }

  @Get('modules')
  @RequirePermission('configuration.read')
  async getModules(@Ctx() ctx: RequestContext) {
    return { modules: await this.configuration.getModuleActivations(ctx) };
  }

  @Put('modules/:moduleKey')
  @RequirePermission('configuration.publish')
  async setModule(
    @Param('moduleKey') moduleKey: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(moduleSchema, body);
    return this.configuration.setModuleActivation(moduleKey, input.enabled, ctx);
  }

  @Get('custom-fields/:objectType')
  @RequirePermission('configuration.read')
  async listCustomFields(@Param('objectType') objectType: string, @Ctx() ctx: RequestContext) {
    return { fields: await this.configuration.listCustomFields(objectType, ctx) };
  }

  @Post('custom-fields')
  @RequirePermission('configuration.publish')
  async defineCustomField(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.configuration.defineCustomField(parseBody(customFieldSchema, body), ctx);
  }
}
