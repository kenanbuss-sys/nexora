import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { CollaborationService, SearchService } from '@nexora/domain-collab';
import { COLLAB_ENTITY_TYPES } from '@nexora/domain-collab';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const COLLAB_SERVICE = 'COLLAB_SERVICE';
export const SEARCH_SERVICE = 'SEARCH_SERVICE';

const entityRef = z.object({
  entityType: z.enum(COLLAB_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

const addCommentSchema = entityRef.extend({
  body: z.string().min(1).max(4000),
  mentions: z.array(z.string().uuid()).max(20).optional(),
});

const uploadAttachmentSchema = entityRef.extend({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  dataBase64: z.string().min(1),
});

/** Comments with mentions on business records (CORE-010). */
@Controller('api/v1/comments')
export class CommentsController {
  constructor(@Inject(COLLAB_SERVICE) private readonly collab: CollaborationService) {}

  @Get()
  @RequirePermission('collab.use')
  async list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return { comments: await this.collab.listComments(entityType, entityId, ctx) };
  }

  @Post()
  @RequirePermission('collab.use')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.collab.addComment(parseBody(addCommentSchema, body), ctx);
  }
}

/** Attachments on business records (CORE-009). */
@Controller('api/v1/attachments')
export class AttachmentsController {
  constructor(@Inject(COLLAB_SERVICE) private readonly collab: CollaborationService) {}

  @Get()
  @RequirePermission('collab.use')
  async list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return { attachments: await this.collab.listAttachments(entityType, entityId, ctx) };
  }

  @Post()
  @RequirePermission('collab.use')
  async upload(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.collab.uploadAttachment(parseBody(uploadAttachmentSchema, body), ctx);
  }

  @Get(':id/download')
  @RequirePermission('collab.use')
  async download(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.collab.downloadAttachment(id, ctx);
  }
}

/** Global search over the tenant's records (CORE-011). */
@Controller('api/v1/search')
export class SearchController {
  constructor(@Inject(SEARCH_SERVICE) private readonly search: SearchService) {}

  @Get()
  @RequirePermission('search.read')
  async query(@Query('q') q: string, @Ctx() ctx: RequestContext) {
    return { hits: await this.search.search(q ?? '', ctx) };
  }
}
