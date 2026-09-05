import { createHmac, randomBytes } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { PrismaClient, WebhookDeliveryStatus } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Integration hub — outbound webhooks (INT-008).
 *
 * Fan-out is exactly-once per (subscription, outbox event) via a unique
 * constraint (INT-011). Deliveries POST the event with an HMAC-SHA256
 * signature, retry with exponential backoff (INT-012), dead-letter
 * after MAX_ATTEMPTS (INT-013) and keep full run history (INT-016).
 * Health (INT-015) summarizes per-subscription delivery state.
 */

export interface SubscriptionView {
  id: string;
  name: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}

export interface DeliveryView {
  id: string;
  subscriptionId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface SubscriptionHealth {
  subscriptionId: string;
  name: string;
  active: boolean;
  pending: number;
  delivered: number;
  failed: number;
  dead: number;
  lastDeliveredAt: string | null;
}

/** Transport port: HTTP is an adapter concern, injected for testability. */
export interface WebhookTransport {
  post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<{ ok: boolean; status: number }>;
}

export const fetchTransport: WebhookTransport = {
  async post(url, body, headers) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.ok, status: response.status };
  },
};

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

export class IntegrationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly transport: WebhookTransport = fetchTransport,
  ) {}

  // ------------------------------------------------------------ subscriptions

  async listSubscriptions(ctx: RequestContext): Promise<SubscriptionView[]> {
    const subs = await this.prisma.webhookSubscription.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return subs.map((s) => this.toSubscriptionView(s));
  }

  /** Creates a subscription; the signing secret is returned exactly once. */
  async createSubscription(
    input: { name: string; url: string; eventTypes: string[] },
    ctx: RequestContext,
  ): Promise<SubscriptionView & { secret: string }> {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'Webhook URL is not a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new DomainError('VALIDATION_FAILED', 'Webhook URL must be http(s)');
    }
    if (input.eventTypes.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Subscribe to at least one event type');
    }
    const secret = randomBytes(24).toString('hex');
    try {
      const sub = await this.prisma.$transaction(async (tx) => {
        const created = await tx.webhookSubscription.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            url: input.url,
            secret,
            eventTypes: input.eventTypes,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'int.webhook.create',
          objectType: 'WebhookSubscription',
          objectId: created.id,
          source: 'api',
          newValues: { name: input.name, url: input.url, eventTypes: input.eventTypes },
        });
        return created;
      });
      return { ...this.toSubscriptionView(sub), secret };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Subscription '${input.name}' already exists`);
      }
      throw error;
    }
  }

  async setSubscriptionActive(
    subscriptionId: string,
    active: boolean,
    ctx: RequestContext,
  ): Promise<void> {
    const updated = await this.prisma.webhookSubscription.updateMany({
      where: { id: subscriptionId, tenantId: ctx.tenantId },
      data: { active },
    });
    if (updated.count === 0) throw notFound('WebhookSubscription', subscriptionId);
  }

  private toSubscriptionView(s: {
    id: string;
    name: string;
    url: string;
    eventTypes: string[];
    active: boolean;
    createdAt: Date;
  }): SubscriptionView {
    return {
      id: s.id,
      name: s.name,
      url: s.url,
      eventTypes: s.eventTypes,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
    };
  }

  // -------------------------------------------------------- fan-out/dispatch

  /**
   * Creates missing deliveries for outbox events matching active
   * subscriptions. Safe to re-run: the unique constraint makes it a
   * no-op for pairs that already exist.
   */
  async fanOut(tenantId: string): Promise<number> {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { tenantId, active: true },
    });
    if (subscriptions.length === 0) return 0;
    const types = [...new Set(subscriptions.flatMap((s) => s.eventTypes))];
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        tenantId,
        eventType: { in: types },
        occurredAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { occurredAt: 'asc' },
      take: 500,
    });
    let created = 0;
    for (const sub of subscriptions) {
      const matching = events.filter((e) => sub.eventTypes.includes(e.eventType));
      if (matching.length === 0) continue;
      const result = await this.prisma.webhookDelivery.createMany({
        data: matching.map((e) => ({
          tenantId,
          subscriptionId: sub.id,
          outboxEventId: e.id,
          eventType: e.eventType,
          payload: {
            eventType: e.eventType,
            aggregateType: e.aggregateType,
            aggregateId: e.aggregateId,
            occurredAt: e.occurredAt.toISOString(),
            payload: e.payload,
          },
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  }

  /** Attempts due deliveries; backs off failures; dead-letters at cap. */
  async dispatchDue(tenantId: string): Promise<{ delivered: number; failed: number }> {
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: new Date() },
      },
      include: { subscription: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let delivered = 0;
    let failed = 0;
    for (const delivery of due) {
      if (!delivery.subscription.active) continue;
      const body = JSON.stringify(delivery.payload);
      const signature = createHmac('sha256', delivery.subscription.secret)
        .update(body)
        .digest('hex');
      let outcome: { ok: boolean; detail: string };
      try {
        const response = await this.transport.post(delivery.subscription.url, body, {
          'x-nexora-signature': `sha256=${signature}`,
          'x-nexora-event': delivery.eventType,
          'x-nexora-delivery': delivery.id,
        });
        outcome = response.ok
          ? { ok: true, detail: `HTTP ${response.status}` }
          : { ok: false, detail: `HTTP ${response.status}` };
      } catch (error) {
        outcome = { ok: false, detail: (error as Error).message.slice(0, 300) };
      }
      if (outcome.ok) {
        await this.prisma.webhookDelivery.updateMany({
          where: { id: delivery.id, tenantId },
          data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null },
        });
        delivered += 1;
      } else {
        const attempts = delivery.attempts + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        await this.prisma.webhookDelivery.updateMany({
          where: { id: delivery.id, tenantId },
          data: {
            status: dead ? 'DEAD' : 'FAILED',
            attempts,
            lastError: outcome.detail,
            nextAttemptAt: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (attempts - 1)),
          },
        });
        failed += 1;
      }
    }
    return { delivered, failed };
  }

  /** One call the API/worker runs: fan out, then attempt what is due. */
  async process(ctx: RequestContext): Promise<{
    fannedOut: number;
    delivered: number;
    failed: number;
  }> {
    const fannedOut = await this.fanOut(ctx.tenantId);
    const { delivered, failed } = await this.dispatchDue(ctx.tenantId);
    return { fannedOut, delivered, failed };
  }

  // ---------------------------------------------------------------- history

  async listDeliveries(
    filter: { subscriptionId?: string | undefined; status?: WebhookDeliveryStatus | undefined },
    ctx: RequestContext,
  ): Promise<DeliveryView[]> {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return deliveries.map((d) => ({
      id: d.id,
      subscriptionId: d.subscriptionId,
      eventType: d.eventType,
      status: d.status,
      attempts: d.attempts,
      nextAttemptAt: d.nextAttemptAt.toISOString(),
      lastError: d.lastError,
      deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async health(ctx: RequestContext): Promise<SubscriptionHealth[]> {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    const rows: SubscriptionHealth[] = [];
    for (const sub of subscriptions) {
      const grouped = await this.prisma.webhookDelivery.groupBy({
        by: ['status'],
        where: { tenantId: ctx.tenantId, subscriptionId: sub.id },
        _count: { _all: true },
      });
      const count = (status: WebhookDeliveryStatus): number =>
        grouped.find((g) => g.status === status)?._count._all ?? 0;
      const last = await this.prisma.webhookDelivery.findFirst({
        where: { tenantId: ctx.tenantId, subscriptionId: sub.id, status: 'DELIVERED' },
        orderBy: { deliveredAt: 'desc' },
      });
      rows.push({
        subscriptionId: sub.id,
        name: sub.name,
        active: sub.active,
        pending: count('PENDING'),
        delivered: count('DELIVERED'),
        failed: count('FAILED'),
        dead: count('DEAD'),
        lastDeliveredAt: last?.deliveredAt ? last.deliveredAt.toISOString() : null,
      });
    }
    return rows;
  }
}
