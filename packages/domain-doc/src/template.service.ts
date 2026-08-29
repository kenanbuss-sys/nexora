import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * DOC — document template foundation.
 * Published template versions are immutable; a change publishes a new version.
 * Rendering (with preserved template version, source aggregate and hash)
 * arrives in a later sprint.
 */

export interface TemplateView {
  key: string;
  name: string;
  version: number;
  content: string;
}

export class DocumentTemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Publish a new immutable version (creates the template on first publish). */
  async publishTemplate(
    input: { key: string; name: string; content: string },
    ctx: RequestContext,
  ): Promise<TemplateView> {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Template key must be kebab-case');
    }
    if (input.content.length === 0 || input.content.length > 200_000) {
      throw new DomainError('VALIDATION_FAILED', 'Template content must be 1-200000 chars');
    }
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.upsert({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: input.key } },
        create: { tenantId: ctx.tenantId, key: input.key, name: input.name },
        update: { name: input.name },
      });
      const last = await tx.documentTemplateVersion.findFirst({
        where: { templateId: template.id },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;
      await tx.documentTemplateVersion.create({
        data: { tenantId: ctx.tenantId, templateId: template.id, version, content: input.content },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'document.template.publish',
        objectType: 'DocumentTemplateVersion',
        objectId: `${template.id}:${version}`,
        source: 'api',
        newValues: { key: input.key, version },
      });
      return { key: input.key, name: input.name, version, content: input.content };
    });
  }

  /** Latest published version, or a specific one. */
  async getTemplate(key: string, ctx: RequestContext, version?: number): Promise<TemplateView> {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { tenantId: ctx.tenantId, key },
    });
    if (!template) throw notFound('DocumentTemplate', key);
    const v = await this.prisma.documentTemplateVersion.findFirst({
      where: { templateId: template.id, ...(version ? { version } : {}) },
      orderBy: { version: 'desc' },
    });
    if (!v) throw notFound('DocumentTemplateVersion', `${key}:${version ?? 'latest'}`);
    return { key: template.key, name: template.name, version: v.version, content: v.content };
  }
}
