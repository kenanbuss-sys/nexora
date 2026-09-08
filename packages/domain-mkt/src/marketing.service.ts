import { createHash } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * MKT — marketing (MKT-001..012). Campaigns are a governed
 * custom-object register; segments, journeys, forms, coupons and
 * experiments are tenant configuration; sends go through provider-
 * neutral connectors and honour the audited consent registry; leads,
 * attribution and analytics ride the audit ledger with idempotency
 * markers. No new tables.
 */

const CAMPAIGN_OBJECT = {
  key: 'mkt_campaign',
  name: 'Kampanja',
  fields: [
    { key: 'code', label: 'Šifra', type: 'text', required: true },
    { key: 'naziv', label: 'Naziv', type: 'text', required: true },
    {
      key: 'kanal',
      label: 'Kanal',
      type: 'select',
      required: true,
      options: ['email', 'sms', 'push'],
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: ['nacrt', 'aktivna', 'zavrsena'],
    },
    { key: 'budzet', label: 'Budžet', type: 'number', required: false },
  ],
};

const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;

/** Cross-domain contract: tenant configuration (owned by core). */
export interface MarketingConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: governed custom objects (owned by core). */
export interface MarketingObjectGate {
  defineObject(
    input: { key: string; name: string; fields: unknown },
    ctx: RequestContext,
  ): Promise<unknown>;
  listRecords(
    key: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; data: unknown; createdAt: string }>>;
}

/** Cross-domain contract: connector push (owned by INT). */
export interface MarketingConnectorGate {
  pushObject(
    input: { key: string; objectType: string; objectId: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }>;
}

/** Cross-domain contract: lead creation (owned by CRM). */
export interface MarketingLeadGate {
  createLead(
    input: {
      name: string;
      company?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
      source?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

export interface SegmentDefinition {
  key: string;
  name: string;
  /** 'all' | 'with-orders' | 'without-orders' */
  rule: string;
}

export interface CampaignView {
  recordId: string;
  code: string;
  name: string;
  channel: string;
  status: string;
  budget: number;
}

export class MarketingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly objects: MarketingObjectGate,
    private readonly configuration: MarketingConfigGate,
    private readonly connectors?: MarketingConnectorGate,
    private readonly leads?: MarketingLeadGate,
  ) {}

  private async config(tenantId: string): Promise<Record<string, unknown>> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    return ((config as Record<string, unknown>).mkt ?? {}) as Record<string, unknown>;
  }

  private async marked(action: string, objectId: string, tenantId: string) {
    return this.prisma.auditEvent.findFirst({
      where: { tenantId, action, objectType: 'Campaign', objectId },
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
      objectType: 'Campaign',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  // -------------------------------------------------------- campaigns (MKT-001)

  /** Provision the campaign register. Idempotent. */
  async setup(ctx: RequestContext): Promise<{ ok: true }> {
    try {
      await this.objects.defineObject(CAMPAIGN_OBJECT, ctx);
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'CONFLICT')) throw error;
    }
    return { ok: true };
  }

  async campaigns(ctx: RequestContext): Promise<CampaignView[]> {
    const records = await this.objects.listRecords(CAMPAIGN_OBJECT.key, ctx);
    return records.map((record) => {
      const data = (record.data ?? {}) as Record<string, unknown>;
      return {
        recordId: record.id,
        code: String(data.code ?? ''),
        name: String(data.naziv ?? ''),
        channel: String(data.kanal ?? ''),
        status: String(data.status ?? ''),
        budget: Number(data.budzet) || 0,
      };
    });
  }

  private async campaign(code: string, ctx: RequestContext): Promise<CampaignView> {
    const match = (await this.campaigns(ctx)).find((c) => c.code === code);
    if (!match) throw notFound('Campaign', code);
    return match;
  }

  // ------------------------------------------- segments & lists (MKT-002/003)

  async segments(ctx: RequestContext): Promise<SegmentDefinition[]> {
    const mkt = await this.config(ctx.tenantId);
    const raw = Array.isArray(mkt.segments) ? mkt.segments : [];
    return raw
      .map((entry) => entry as Record<string, unknown>)
      .filter((s) => typeof s.key === 'string' && typeof s.rule === 'string')
      .map((s) => ({
        key: s.key as string,
        name: typeof s.name === 'string' ? s.name : (s.key as string),
        rule: s.rule as string,
      }));
  }

  /** Materialize a segment into a marketing list (audience snapshot). */
  async buildList(
    input: { segmentKey: string },
    ctx: RequestContext,
  ): Promise<{ segmentKey: string; members: number; accountIds: string[] }> {
    const segment = (await this.segments(ctx)).find((s) => s.key === input.segmentKey);
    if (!segment) throw notFound('Segment', input.segmentKey);
    const accounts = await this.prisma.crmAccount.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true },
      take: 500,
    });
    let ids = accounts.map((a) => a.id);
    if (segment.rule === 'with-orders' || segment.rule === 'without-orders') {
      const withOrders = new Set(
        (
          await this.prisma.salesOrder.findMany({
            where: { tenantId: ctx.tenantId, accountId: { in: ids } },
            select: { accountId: true },
          })
        ).map((o) => o.accountId),
      );
      ids =
        segment.rule === 'with-orders'
          ? ids.filter((id) => withOrders.has(id))
          : ids.filter((id) => !withOrders.has(id));
    } else if (segment.rule !== 'all') {
      throw new DomainError('VALIDATION_FAILED', `Unknown segment rule '${segment.rule}'`);
    }
    await this.mark('mkt.list.build', `segment:${segment.key}`, { members: ids.length }, ctx);
    return { segmentKey: segment.key, members: ids.length, accountIds: ids };
  }

  // ------------------------------------------------------- consent (MKT-009)

  /** Record consent for an account+channel; the latest event wins. */
  async setConsent(
    input: { accountId: string; channel: string; granted: boolean },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (!['email', 'sms', 'push'].includes(input.channel)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown channel '${input.channel}'`);
    }
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', input.accountId);
    await this.mark(
      'mkt.consent',
      `consent:${account.id}:${input.channel}`,
      { granted: input.granted },
      ctx,
    );
    return { ok: true };
  }

  private async consented(accountIds: string[], channel: string, tenantId: string) {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId,
        action: 'mkt.consent',
        objectType: 'Campaign',
        objectId: { in: accountIds.map((id) => `consent:${id}:${channel}`) },
      },
      orderBy: { occurredAt: 'asc' },
      take: 5000,
    });
    const latest = new Map<string, boolean>();
    for (const event of events) {
      const accountId = event.objectId.split(':')[1] ?? '';
      latest.set(accountId, (event.newValues as { granted?: boolean } | null)?.granted === true);
    }
    // Consent is opt-in: only accounts whose latest event grants it.
    return accountIds.filter((id) => latest.get(id) === true);
  }

  // ------------------------------------- sends via connectors (MKT-004/005/009)

  /**
   * Send one campaign step to a segment through a connector. Consent-
   * filtered, exactly-once per campaign+step+segment.
   */
  async send(
    input: { campaignCode: string; step: string; segmentKey: string; connectorKey: string },
    ctx: RequestContext,
  ): Promise<{ sent: number; skippedNoConsent: number; existing: boolean; reference: string }> {
    if (!this.connectors) throw new DomainError('INVALID_STATE', 'Connectors are not wired');
    if (!KEY_RE.test(input.step)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid step key');
    }
    const campaign = await this.campaign(input.campaignCode, ctx);
    if (campaign.status !== 'aktivna') {
      throw new DomainError('INVALID_STATE', 'Only an active campaign can send');
    }
    const marker = `${campaign.code}:send:${input.step}:${input.segmentKey}`;
    const already = await this.marked('mkt.send', marker, ctx.tenantId);
    if (already) {
      const values = already.newValues as { sent?: number; reference?: string } | null;
      return {
        sent: Number(values?.sent ?? 0),
        skippedNoConsent: 0,
        existing: true,
        reference: values?.reference ?? '',
      };
    }
    const list = await this.buildList({ segmentKey: input.segmentKey }, ctx);
    const allowed = await this.consented(list.accountIds, campaign.channel, ctx.tenantId);
    const result = await this.connectors.pushObject(
      {
        key: input.connectorKey,
        objectType: 'campaign_send',
        objectId: marker,
        payload: {
          campaign: campaign.code,
          step: input.step,
          channel: campaign.channel,
          recipients: allowed,
        },
      },
      ctx,
    );
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The messaging provider refused the send');
    }
    await this.mark(
      'mkt.send',
      marker,
      { sent: allowed.length, reference: result.reference, channel: campaign.channel },
      ctx,
    );
    return {
      sent: allowed.length,
      skippedNoConsent: list.accountIds.length - allowed.length,
      existing: false,
      reference: result.reference,
    };
  }

  /** Journey definition for a campaign (MKT-004): ordered steps from config. */
  async journey(
    campaignCode: string,
    ctx: RequestContext,
  ): Promise<Array<{ step: string; afterDays: number }>> {
    const campaign = await this.campaign(campaignCode, ctx);
    const mkt = await this.config(ctx.tenantId);
    const journeys = (mkt.journeys ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(journeys[campaign.code])
      ? (journeys[campaign.code] as unknown[])
      : [];
    return raw
      .map((entry) => entry as Record<string, unknown>)
      .filter((s) => typeof s.step === 'string')
      .map((s) => ({ step: s.step as string, afterDays: Number(s.afterDays) || 0 }));
  }

  // -------------------------------------------------- lead capture (MKT-006)

  /** Submit a configured lead-capture form; creates a CRM lead once. */
  async submitForm(
    input: {
      formKey: string;
      submissionId: string;
      values: Record<string, string>;
    },
    ctx: RequestContext,
  ): Promise<{ leadId: string | null; duplicate: boolean }> {
    if (!this.leads) throw new DomainError('INVALID_STATE', 'CRM is not wired');
    if (!KEY_RE.test(input.submissionId)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid submission id');
    }
    const mkt = await this.config(ctx.tenantId);
    const forms = Array.isArray(mkt.forms) ? mkt.forms : [];
    const form = forms
      .map((entry) => entry as Record<string, unknown>)
      .find((f) => f.key === input.formKey);
    if (!form) throw notFound('LeadForm', input.formKey);
    const required = Array.isArray(form.required)
      ? form.required.filter((r): r is string => typeof r === 'string')
      : ['name'];
    for (const field of required) {
      if (!input.values[field]?.trim()) {
        throw new DomainError('VALIDATION_FAILED', `Field '${field}' is required`);
      }
    }
    const marker = `form:${input.formKey}:${input.submissionId}`;
    const already = await this.marked('mkt.lead.capture', marker, ctx.tenantId);
    if (already) {
      return {
        leadId: (already.newValues as { leadId?: string } | null)?.leadId ?? null,
        duplicate: true,
      };
    }
    const lead = await this.leads.createLead(
      {
        name: input.values.name ?? 'Nepoznat',
        company: input.values.company,
        email: input.values.email,
        phone: input.values.phone,
        source: `form:${input.formKey}`,
      },
      ctx,
    );
    await this.mark('mkt.lead.capture', marker, { leadId: lead.id, formKey: input.formKey }, ctx);
    return { leadId: lead.id, duplicate: false };
  }

  // -------------------------------------- coupons & targeting (MKT-007/008)

  /** Coupons per campaign come from configuration (mkt.coupons). */
  async validateCoupon(
    input: { code: string },
    ctx: RequestContext,
  ): Promise<{ valid: boolean; campaignCode: string | null; discountPct: number }> {
    const mkt = await this.config(ctx.tenantId);
    const coupons = Array.isArray(mkt.coupons) ? mkt.coupons : [];
    const hit = coupons
      .map((entry) => entry as Record<string, unknown>)
      .find((c) => c.code === input.code);
    if (!hit || typeof hit.campaign !== 'string') {
      return { valid: false, campaignCode: null, discountPct: 0 };
    }
    // The campaign must exist and be active for the coupon to be live.
    const campaign = (await this.campaigns(ctx)).find((c) => c.code === hit.campaign);
    const valid = campaign?.status === 'aktivna';
    return {
      valid,
      campaignCode: valid ? (hit.campaign as string) : null,
      discountPct: valid ? Number(hit.discountPct) || 0 : 0,
    };
  }

  /** MKT-007: link a campaign to a price list (promotion pricing). */
  async linkPromotion(
    input: { campaignCode: string; priceListId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const campaign = await this.campaign(input.campaignCode, ctx);
    const priceList = await this.prisma.priceList.findFirst({
      where: { id: input.priceListId, tenantId: ctx.tenantId },
    });
    if (!priceList) throw notFound('PriceList', input.priceListId);
    const objectId = `${campaign.code}:promo:${priceList.id}`;
    if (await this.marked('mkt.promo.link', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark('mkt.promo.link', objectId, { priceListId: priceList.id }, ctx);
    return { ok: true, duplicate: false };
  }

  // ---------------------------------------------------- attribution (MKT-010)

  /** Attribute a sales order to a campaign (utm/coupon at checkout). */
  async attributeOrder(
    input: { campaignCode: string; orderId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const campaign = await this.campaign(input.campaignCode, ctx);
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
    });
    if (!order) throw notFound('SalesOrder', input.orderId);
    const objectId = `attr:${order.id}`;
    if (await this.marked('mkt.attribution', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark('mkt.attribution', objectId, { campaignCode: campaign.code }, ctx);
    return { ok: true, duplicate: false };
  }

  // ------------------------------------------- experiments & analytics (MKT-011/012)

  /** Deterministic A/B assignment: hash(campaign, subject) → variant. */
  async variant(
    input: { campaignCode: string; subjectId: string },
    ctx: RequestContext,
  ): Promise<{ variant: 'A' | 'B' }> {
    const campaign = await this.campaign(input.campaignCode, ctx);
    const digest = createHash('sha256')
      .update(`${ctx.tenantId}:${campaign.code}:${input.subjectId}`)
      .digest();
    return { variant: (digest[0] ?? 0) % 2 === 0 ? 'A' : 'B' };
  }

  /** Campaign analytics: sends, captured leads, attributed revenue. */
  async analytics(
    campaignCode: string,
    ctx: RequestContext,
  ): Promise<{
    campaign: string;
    sends: number;
    recipients: number;
    attributedOrders: number;
    attributedRevenue: string;
  }> {
    const campaign = await this.campaign(campaignCode, ctx);
    const sendEvents = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'mkt.send',
        objectType: 'Campaign',
        objectId: { startsWith: `${campaign.code}:send:` },
      },
      take: 1000,
    });
    const recipients = sendEvents.reduce(
      (sum, e) => sum + Number((e.newValues as { sent?: number } | null)?.sent ?? 0),
      0,
    );
    const attributions = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'mkt.attribution',
        objectType: 'Campaign',
        objectId: { startsWith: 'attr:' },
      },
      take: 5000,
    });
    const orderIds = attributions
      .filter(
        (e) => (e.newValues as { campaignCode?: string } | null)?.campaignCode === campaign.code,
      )
      .map((e) => e.objectId.slice('attr:'.length));
    let revenue = 0;
    if (orderIds.length > 0) {
      const orders = await this.prisma.salesOrder.findMany({
        where: { tenantId: ctx.tenantId, id: { in: orderIds } },
        select: { total: true },
      });
      revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    }
    return {
      campaign: campaign.code,
      sends: sendEvents.length,
      recipients,
      attributedOrders: orderIds.length,
      attributedRevenue: revenue.toFixed(2),
    };
  }
}
