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
  status: string;
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
      return {
        key: input.key,
        name: input.name,
        version,
        content: input.content,
        status: template.status,
      };
    });
  }

  /**
   * Template lifecycle (DOC-005): DRAFT templates render only for
   * previews, ACTIVE render everywhere, RETIRED refuse to render but
   * keep every immutable version for history. Transitions are audited.
   */
  async setStatus(
    input: { key: string; status: 'DRAFT' | 'ACTIVE' | 'RETIRED' },
    ctx: RequestContext,
  ): Promise<{ key: string; status: string }> {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { tenantId: ctx.tenantId, key: input.key },
    });
    if (!template) throw notFound('DocumentTemplate', input.key);
    if (template.status === input.status) {
      return { key: template.key, status: template.status };
    }
    await this.prisma.documentTemplate.update({
      where: { id: template.id },
      data: { status: input.status },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'document.template.status',
      objectType: 'DocumentTemplate',
      objectId: template.id,
      source: 'api',
      previousValues: { status: template.status },
      newValues: { status: input.status },
    });
    return { key: template.key, status: input.status };
  }

  async listTemplates(
    ctx: RequestContext,
  ): Promise<Array<{ key: string; name: string; status: string; latestVersion: number }>> {
    const templates = await this.prisma.documentTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ key: 'asc' }],
      take: 200,
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    return templates.map((t) => ({
      key: t.key,
      name: t.name,
      status: t.status,
      latestVersion: t.versions[0]?.version ?? 0,
    }));
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
    if (template.status === 'RETIRED') {
      throw new DomainError('INVALID_STATE', `Template ${key} is retired`);
    }
    return {
      key: template.key,
      name: template.name,
      version: v.version,
      content: v.content,
      status: template.status,
    };
  }
}
