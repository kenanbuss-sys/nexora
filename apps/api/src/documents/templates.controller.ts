import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { DocumentTemplateService } from '@nexora/domain-doc';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const TEMPLATE_SERVICE = 'TEMPLATE_SERVICE';

const publishTemplateSchema = z.object({
  key: z.string().min(2).max(64),
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(200_000),
});

@Controller('api/v1/document-templates')
export class DocumentTemplatesController {
  constructor(@Inject(TEMPLATE_SERVICE) private readonly templates: DocumentTemplateService) {}

  @Post('publish')
  @RequirePermission('document.issue')
  async publish(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.templates.publishTemplate(parseBody(publishTemplateSchema, body), ctx);
  }

  @Get(':key')
  @RequirePermission('document.read')
  async get(
    @Param('key') key: string,
    @Ctx() ctx: RequestContext,
    @Query('version') version?: string,
  ) {
    const parsed = version ? Number(version) : undefined;
    return this.templates.getTemplate(key, ctx, Number.isFinite(parsed) ? parsed : undefined);
  }
}
