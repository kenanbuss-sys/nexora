import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Collaboration layer — comments with mentions on any business record
 * (CORE-010), attachments behind a storage port (CORE-009) and governed
 * per-tenant number sequences (CORE-008).
 *
 * Comments and attachments hang off (entityType, entityId) pairs from a
 * validated whitelist, so the layer never becomes a dumping ground and
 * cross-tenant references cannot be smuggled in. Sequences advance with
 * one atomic UPDATE … RETURNING, so two concurrent draws never collide.
 */

/** Record families that accept comments and attachments. */
export const COLLAB_ENTITY_TYPES = [
  'sales_order',
  'quote',
  'purchase_order',
  'work_order',
  'invoice',
  'crm_account',
  'ncr',
  'sku',
  'product',
] as const;
export type CollabEntityType = (typeof COLLAB_ENTITY_TYPES)[number];

export interface CommentView {
  id: string;
  entityType: string;
  entityId: string;
  body: string;
  mentions: string[];
  createdBy: string | null;
  createdAt: string;
}

export interface AttachmentView {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
}

/** Fan-out port to the notifications owner (CORE domain). */
export interface MentionNotifier {
  notifyMention(
    tenantId: string,
    userId: string,
    input: { title: string; body: string; entityType: string; entityId: string },
  ): Promise<void>;
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export class CollaborationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifier?: MentionNotifier,
  ) {}

  private assertEntityType(entityType: string): void {
    if (!(COLLAB_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw new DomainError('VALIDATION_FAILED', `Unsupported entity type '${entityType}'`);
    }
  }

  // ---------------------------------------------------------------- comments

  async addComment(
    input: { entityType: string; entityId: string; body: string; mentions?: string[] | undefined },
    ctx: RequestContext,
  ): Promise<CommentView> {
    this.assertEntityType(input.entityType);
    const body = input.body.trim();
    if (!body) throw new DomainError('VALIDATION_FAILED', 'Comment body must not be empty');

    const mentions = [...new Set(input.mentions ?? [])];
    if (mentions.length > 0) {
      const known = await this.prisma.user.findMany({
        where: { tenantId: ctx.tenantId, id: { in: mentions } },
        select: { id: true },
      });
      if (known.length !== mentions.length) {
        throw new DomainError('VALIDATION_FAILED', 'Mentioned users must belong to this tenant');
      }
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          body,
          mentions,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'collab.comment.add',
        objectType: 'Comment',
        objectId: created.id,
        source: 'api',
        newValues: { entityType: input.entityType, entityId: input.entityId },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.COMMENT_ADDED,
        aggregateType: 'Comment',
        aggregateId: created.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { entityType: input.entityType, entityId: input.entityId, mentions },
      });
      return created;
    });

    if (this.notifier) {
      for (const userId of mentions) {
        if (userId === ctx.userId) continue;
        await this.notifier.notifyMention(ctx.tenantId, userId, {
          title: 'You were mentioned in a comment',
          body: body.slice(0, 200),
          entityType: input.entityType,
          entityId: input.entityId,
        });
      }
    }
    return this.toCommentView(comment);
  }

  async listComments(
    entityType: string,
    entityId: string,
    ctx: RequestContext,
  ): Promise<CommentView[]> {
    this.assertEntityType(entityType);
    const comments = await this.prisma.comment.findMany({
      where: { tenantId: ctx.tenantId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return comments.map((c) => this.toCommentView(c));
  }

  private toCommentView(c: {
    id: string;
    entityType: string;
    entityId: string;
    body: string;
    mentions: string[];
    createdBy: string | null;
    createdAt: Date;
  }): CommentView {
    return {
      id: c.id,
      entityType: c.entityType,
      entityId: c.entityId,
      body: c.body,
      mentions: c.mentions,
      createdBy: c.createdBy,
      createdAt: c.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------------------- attachments

  async uploadAttachment(
    input: {
      entityType: string;
      entityId: string;
      fileName: string;
      contentType: string;
      dataBase64: string;
    },
    ctx: RequestContext,
  ): Promise<AttachmentView> {
    this.assertEntityType(input.entityType);
    const data = Buffer.from(input.dataBase64, 'base64');
    if (data.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Attachment content must not be empty');
    }
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new DomainError('VALIDATION_FAILED', 'Attachment exceeds the 5MB limit');
    }
    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: data.length,
          storageKey: `db://${ctx.tenantId}`,
          uploadedBy: ctx.userId ?? null,
        },
      });
      await tx.attachmentBlob.create({
        data: { tenantId: ctx.tenantId, attachmentId: created.id, data },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'collab.attachment.upload',
        objectType: 'Attachment',
        objectId: created.id,
        source: 'api',
        newValues: { fileName: input.fileName, sizeBytes: data.length },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.ATTACHMENT_UPLOADED,
        aggregateType: 'Attachment',
        aggregateId: created.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { entityType: input.entityType, entityId: input.entityId },
      });
      return created;
    });
    return this.toAttachmentView(attachment);
  }

  async listAttachments(
    entityType: string,
    entityId: string,
    ctx: RequestContext,
  ): Promise<AttachmentView[]> {
    this.assertEntityType(entityType);
    const attachments = await this.prisma.attachment.findMany({
      where: { tenantId: ctx.tenantId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return attachments.map((a) => this.toAttachmentView(a));
  }

  async downloadAttachment(
    attachmentId: string,
    ctx: RequestContext,
  ): Promise<AttachmentView & { dataBase64: string }> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, tenantId: ctx.tenantId },
    });
    if (!attachment) throw notFound('Attachment', attachmentId);
    const blob = await this.prisma.attachmentBlob.findFirst({
      where: { attachmentId: attachment.id, tenantId: ctx.tenantId },
    });
    if (!blob) throw notFound('AttachmentBlob', attachmentId);
    return {
      ...this.toAttachmentView(attachment),
      dataBase64: Buffer.from(blob.data).toString('base64'),
    };
  }

  private toAttachmentView(a: {
    id: string;
    entityType: string;
    entityId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    uploadedBy: string | null;
    createdAt: Date;
  }): AttachmentView {
    return {
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      fileName: a.fileName,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt.toISOString(),
    };
  }

  // --------------------------------------------------------- number sequence

  /**
   * Draws the next number for a document family (CORE-008). The draw is
   * a single atomic UPDATE … RETURNING, so concurrent callers always
   * get distinct numbers; a missing sequence is created on first use.
   */
  async nextNumber(
    sequenceKey: string,
    ctx: RequestContext,
    options?: { prefix?: string | undefined; padding?: number | undefined },
  ): Promise<string> {
    if (!/^[a-z][a-z0-9_.-]{1,60}$/.test(sequenceKey)) {
      throw new DomainError('VALIDATION_FAILED', `Invalid sequence key '${sequenceKey}'`);
    }
    const prefix = options?.prefix ?? `${sequenceKey.toUpperCase().slice(0, 3)}-`;
    const padding = options?.padding ?? 5;
    await this.prisma.$executeRaw`
      INSERT INTO "number_sequence" ("tenant_id", "sequence_key", "prefix", "padding", "updated_at")
      VALUES (${ctx.tenantId}::uuid, ${sequenceKey}, ${prefix}, ${padding}, now())
      ON CONFLICT ("tenant_id", "sequence_key") DO NOTHING`;
    const rows = await this.prisma.$queryRaw<
      Array<{ value: number; prefix: string; padding: number }>
    >`
      UPDATE "number_sequence"
      SET "next_value" = "next_value" + 1, "updated_at" = now()
      WHERE "tenant_id" = ${ctx.tenantId}::uuid AND "sequence_key" = ${sequenceKey}
      RETURNING "next_value" - 1 AS value, "prefix", "padding"`;
    const row = rows[0];
    if (!row) throw new DomainError('CONFLICT', 'Sequence draw failed — retry');
    return `${row.prefix}${String(row.value).padStart(row.padding, '0')}`;
  }
}
