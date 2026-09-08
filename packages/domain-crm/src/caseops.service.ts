import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient, SupportCasePriority } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { SupportCaseService, SupportCaseView } from './case.service';

/**
 * Support-case operations (CSM-002/004/006/007/008/009/010/012/013/015)
 * on top of the numbered case lifecycle: omnichannel intake with the
 * channel on the audit trail, complaint handling, escalations that
 * open a task, threaded collaboration comments, canned responses and
 * a knowledge base as governed data, generic case-to-record linkage
 * (service requests, RMAs, orders) and satisfaction feedback.
 */

const DEFAULT_CHANNELS = ['email', 'phone', 'portal', 'chat', 'web'];
const LINK_TYPES: ReadonlySet<string> = new Set(['order', 'service_request', 'rma']);

/** Cross-domain contract: tenant configuration (owned by core). */
export interface CaseOpsConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: task engine (owned by WF). */
export interface CaseOpsTaskGate {
  createTask(
    input: { title: string; description?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

/** Cross-domain contract: governed custom objects (owned by core). */
export interface CaseOpsObjectGate {
  defineObject(
    input: { key: string; name: string; fields: unknown },
    ctx: RequestContext,
  ): Promise<unknown>;
  listRecords(
    key: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; data: unknown; createdAt: string }>>;
}

const KB_OBJECT = {
  key: 'csm_kb_article',
  name: 'Članak baze znanja',
  fields: [
    { key: 'naslov', label: 'Naslov', type: 'text', required: true },
    { key: 'sadrzaj', label: 'Sadržaj', type: 'text', required: true },
    { key: 'oznake', label: 'Oznake', type: 'text', required: false },
  ],
};

export class CaseOpsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cases: SupportCaseService,
    private readonly configuration: CaseOpsConfigGate,
    private readonly tasks?: CaseOpsTaskGate,
    private readonly objects?: CaseOpsObjectGate,
  ) {}

  private async supportCase(caseId: string, ctx: RequestContext) {
    const row = await this.prisma.supportCase.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('SupportCase', caseId);
    return row;
  }

  private async marked(action: string, objectId: string, tenantId: string) {
    return this.prisma.auditEvent.findFirst({
      where: { tenantId, action, objectType: 'SupportCase', objectId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  private async mark(
    action: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType: 'SupportCase',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  private async channels(tenantId: string): Promise<string[]> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    const csm = ((config as Record<string, unknown>).csm ?? {}) as Record<string, unknown>;
    const configured = Array.isArray(csm.channels)
      ? csm.channels.filter((c): c is string => typeof c === 'string')
      : [];
    return configured.length > 0 ? configured : DEFAULT_CHANNELS;
  }

  // ------------------------------------------------ omnichannel intake (CSM-002/010)

  /** Create a case with its intake channel on the audit trail. */
  async intake(
    input: {
      subject: string;
      description?: string | undefined;
      channel: string;
      accountId?: string | undefined;
      orderId?: string | undefined;
      priority?: SupportCasePriority | undefined;
    },
    ctx: RequestContext,
  ): Promise<SupportCaseView & { channel: string }> {
    const channels = await this.channels(ctx.tenantId);
    if (!channels.includes(input.channel)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown intake channel '${input.channel}'`);
    }
    const view = await this.cases.createCase(
      {
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        accountId: input.accountId,
        orderId: input.orderId,
      },
      ctx,
    );
    await this.mark('csm.case.channel', view.id, { channel: input.channel }, ctx);
    return { ...view, channel: input.channel };
  }

  /** Case volume per intake channel. */
  async channelReport(ctx: RequestContext): Promise<Array<{ channel: string; cases: number }>> {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, action: 'csm.case.channel', objectType: 'SupportCase' },
      take: 5000,
    });
    const counts = new Map<string, number>();
    for (const event of events) {
      const channel = String((event.newValues as { channel?: unknown } | null)?.channel ?? '');
      if (!channel) continue;
      counts.set(channel, (counts.get(channel) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([channel, cases]) => ({ channel, cases }))
      .sort((a, b) => b.cases - a.cases);
  }

  // ------------------------------------------------------- complaints (CSM-004)

  /** Flag a case as a formal complaint; priority rises to at least HIGH. */
  async markComplaint(
    input: { caseId: string; reason: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (input.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A complaint needs a reason');
    }
    const row = await this.supportCase(input.caseId, ctx);
    if (await this.marked('csm.complaint', row.id, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    if (row.priority === 'LOW' || row.priority === 'NORMAL') {
      await this.prisma.supportCase.update({
        where: { id: row.id },
        data: { priority: 'HIGH' },
      });
    }
    await this.mark('csm.complaint', row.id, { reason: input.reason }, ctx);
    return { ok: true, duplicate: false };
  }

  async complaintReport(
    ctx: RequestContext,
  ): Promise<{ complaints: number; open: number; resolved: number }> {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, action: 'csm.complaint', objectType: 'SupportCase' },
      take: 5000,
    });
    const caseIds = [...new Set(events.map((e) => e.objectId))];
    if (caseIds.length === 0) return { complaints: 0, open: 0, resolved: 0 };
    const rows = await this.prisma.supportCase.findMany({
      where: { tenantId: ctx.tenantId, id: { in: caseIds } },
      select: { status: true },
    });
    const resolved = rows.filter((r) => r.status === 'RESOLVED' || r.status === 'CLOSED').length;
    return { complaints: rows.length, open: rows.length - resolved, resolved };
  }

  // ------------------------------------------------------ escalations (CSM-006)

  /** Escalate a case: URGENT priority plus a follow-up task. Once. */
  async escalate(
    input: { caseId: string; reason: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean; taskId: string | null }> {
    if (input.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'An escalation needs a reason');
    }
    const row = await this.supportCase(input.caseId, ctx);
    if (row.status === 'CLOSED') {
      throw new DomainError('INVALID_STATE', 'A closed case cannot be escalated');
    }
    const existing = await this.marked('csm.escalate', row.id, ctx.tenantId);
    if (existing) {
      const prior = (existing.newValues as { taskId?: string } | null)?.taskId ?? null;
      return { ok: true, duplicate: true, taskId: prior };
    }
    let taskId: string | null = null;
    if (this.tasks) {
      const task = await this.tasks.createTask(
        {
          title: `Eskalacija: ${row.caseNumber} — ${row.subject}`,
          description: input.reason,
        },
        ctx,
      );
      taskId = task.id;
    }
    await this.prisma.supportCase.update({ where: { id: row.id }, data: { priority: 'URGENT' } });
    await this.mark('csm.escalate', row.id, { reason: input.reason, taskId }, ctx);
    return { ok: true, duplicate: false, taskId };
  }

  // ---------------------------------------------------- collaboration (CSM-007)

  async comment(
    input: { caseId: string; body: string },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    const body = input.body.trim();
    if (body.length === 0 || body.length > 2000) {
      throw new DomainError('VALIDATION_FAILED', 'A comment must be 1-2000 characters');
    }
    const row = await this.supportCase(input.caseId, ctx);
    await this.mark('csm.case.comment', row.id, { body }, ctx);
    return { ok: true };
  }

  async comments(
    caseId: string,
    ctx: RequestContext,
  ): Promise<Array<{ body: string; author: string | null; at: string }>> {
    const row = await this.supportCase(caseId, ctx);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'csm.case.comment',
        objectType: 'SupportCase',
        objectId: row.id,
      },
      orderBy: { occurredAt: 'asc' },
      take: 500,
    });
    return events.map((e) => ({
      body: String((e.newValues as { body?: unknown } | null)?.body ?? ''),
      author: e.actorId,
      at: e.occurredAt.toISOString(),
    }));
  }

  // ------------------------------------------------- canned responses (CSM-008)

  async cannedResponses(
    ctx: RequestContext,
  ): Promise<Array<{ key: string; title: string; body: string }>> {
    const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
    const csm = ((config as Record<string, unknown>).csm ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(csm.cannedResponses) ? csm.cannedResponses : [];
    return raw
      .map((entry) => entry as Record<string, unknown>)
      .filter((r) => typeof r.key === 'string' && typeof r.body === 'string')
      .map((r) => ({
        key: r.key as string,
        title: typeof r.title === 'string' ? r.title : (r.key as string),
        body: r.body as string,
      }));
  }

  /** Render a canned response for a case ({{caseNumber}}, {{subject}}). */
  async renderCanned(
    input: { key: string; caseId: string },
    ctx: RequestContext,
  ): Promise<{ body: string }> {
    const responses = await this.cannedResponses(ctx);
    const template = responses.find((r) => r.key === input.key);
    if (!template) throw notFound('CannedResponse', input.key);
    const row = await this.supportCase(input.caseId, ctx);
    const body = template.body
      .replaceAll('{{caseNumber}}', row.caseNumber)
      .replaceAll('{{subject}}', row.subject);
    return { body };
  }

  // ---------------------------------------------------- knowledge base (CSM-009)

  /** Provision the KB register. Idempotent. */
  async setupKb(ctx: RequestContext): Promise<{ ok: true }> {
    if (!this.objects) throw new DomainError('INVALID_STATE', 'Custom objects are not wired');
    try {
      await this.objects.defineObject(KB_OBJECT, ctx);
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'CONFLICT')) throw error;
    }
    return { ok: true };
  }

  async searchKb(
    query: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; title: string; excerpt: string }>> {
    if (!this.objects) throw new DomainError('INVALID_STATE', 'Custom objects are not wired');
    const needle = query.trim().toLowerCase();
    const records = await this.objects.listRecords(KB_OBJECT.key, ctx);
    return records
      .map((record) => {
        const data = (record.data ?? {}) as Record<string, unknown>;
        return {
          id: record.id,
          title: String(data.naslov ?? ''),
          content: String(data.sadrzaj ?? ''),
          tags: String(data.oznake ?? ''),
        };
      })
      .filter(
        (a) =>
          needle.length === 0 ||
          a.title.toLowerCase().includes(needle) ||
          a.content.toLowerCase().includes(needle) ||
          a.tags.toLowerCase().includes(needle),
      )
      .map((a) => ({ id: a.id, title: a.title, excerpt: a.content.slice(0, 200) }));
  }

  // -------------------------------------------------- record linkage (CSM-012/013)

  /** Link a case to another business record (order, service request, RMA). */
  async link(
    input: { caseId: string; entityType: string; entityId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!LINK_TYPES.has(input.entityType)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown link type '${input.entityType}'`);
    }
    if (input.entityId.trim().length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Entity id is required');
    }
    const row = await this.supportCase(input.caseId, ctx);
    if (input.entityType === 'order') {
      const order = await this.prisma.salesOrder.findFirst({
        where: { id: input.entityId, tenantId: ctx.tenantId },
      });
      if (!order) throw notFound('SalesOrder', input.entityId);
    }
    const objectId = `${row.id}:link:${input.entityType}:${input.entityId}`;
    if (await this.marked('csm.case.link', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark(
      'csm.case.link',
      objectId,
      { caseId: row.id, entityType: input.entityType, entityId: input.entityId },
      ctx,
    );
    return { ok: true, duplicate: false };
  }

  async links(
    caseId: string,
    ctx: RequestContext,
  ): Promise<Array<{ entityType: string; entityId: string }>> {
    const row = await this.supportCase(caseId, ctx);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'csm.case.link',
        objectType: 'SupportCase',
        objectId: { startsWith: `${row.id}:link:` },
      },
      orderBy: { occurredAt: 'asc' },
      take: 200,
    });
    return events.map((e) => {
      const values = (e.newValues ?? {}) as Record<string, unknown>;
      return {
        entityType: String(values.entityType ?? ''),
        entityId: String(values.entityId ?? ''),
      };
    });
  }

  // ----------------------------------------------------- satisfaction (CSM-015)

  /** One CSAT rating per resolved case. */
  async rate(
    input: { caseId: string; score: number; comment?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      throw new DomainError('VALIDATION_FAILED', 'Score must be an integer 1-5');
    }
    const row = await this.supportCase(input.caseId, ctx);
    if (row.status !== 'RESOLVED' && row.status !== 'CLOSED') {
      throw new DomainError('INVALID_STATE', 'Only resolved cases can be rated');
    }
    const objectId = `${row.id}:csat`;
    if (await this.marked('csm.csat', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark(
      'csm.csat',
      objectId,
      { score: input.score, comment: input.comment ?? null },
      ctx,
    );
    return { ok: true, duplicate: false };
  }

  async satisfactionReport(
    ctx: RequestContext,
  ): Promise<{ ratings: number; average: string; distribution: Record<string, number> }> {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, action: 'csm.csat', objectType: 'SupportCase' },
      take: 5000,
    });
    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let sum = 0;
    for (const event of events) {
      const score = Number((event.newValues as { score?: unknown } | null)?.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) continue;
      distribution[String(score)] = (distribution[String(score)] ?? 0) + 1;
      sum += score;
    }
    const ratings = Object.values(distribution).reduce((a, b) => a + b, 0);
    return {
      ratings,
      average: ratings > 0 ? (sum / ratings).toFixed(2) : '0.00',
      distribution,
    };
  }
}
