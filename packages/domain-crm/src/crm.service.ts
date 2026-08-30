import { writeAudit } from '@nexora/audit';
import type {
  CrmActivityType,
  CrmAccountStatus,
  LeadStatus,
  OpportunityStage,
  PrismaClient,
} from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CRM domain — customer accounts (CRM-002), leads (CRM-001), opportunities
 * (CRM-003) and the interaction timeline (CRM-004/010).
 *
 * Party identity is owned by MDM: an account references a partyId and adds
 * only the commercial relationship. Cross-domain access to parties goes
 * through the MDM public interface (PartyGate).
 */

export interface AccountView {
  id: string;
  partyId: string;
  accountNumber: string;
  status: CrmAccountStatus;
  creditLimit: string | null;
  ownerUserId: string | null;
}

export interface LeadView {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  convertedAccountId: string | null;
  convertedOpportunityId: string | null;
}

export interface OpportunityView {
  id: string;
  accountId: string;
  title: string;
  stage: OpportunityStage;
  amount: string | null;
  currency: string | null;
  expectedCloseDate: string | null;
}

export interface ActivityView {
  id: string;
  accountId: string | null;
  opportunityId: string | null;
  activityType: CrmActivityType;
  subject: string;
  body: string | null;
  occurredAt: string;
}

/** Cross-domain contract: party identity is owned by MDM. */
export interface PartyGate {
  getPartyState(
    tenantId: string,
    partyId: string,
  ): Promise<{ exists: boolean; active: boolean; name: string } | null>;
  createOrganization(tenantId: string, name: string, email?: string): Promise<{ partyId: string }>;
}

/** Allowed opportunity stage transitions (state machine). */
const STAGE_FLOW: Record<OpportunityStage, OpportunityStage[]> = {
  NEW: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

function toAccountView(a: {
  id: string;
  partyId: string;
  accountNumber: string;
  status: CrmAccountStatus;
  creditLimit: { toString(): string } | null;
  ownerUserId: string | null;
}): AccountView {
  return {
    id: a.id,
    partyId: a.partyId,
    accountNumber: a.accountNumber,
    status: a.status,
    creditLimit: a.creditLimit ? a.creditLimit.toString() : null,
    ownerUserId: a.ownerUserId,
  };
}

function toOpportunityView(o: {
  id: string;
  accountId: string;
  title: string;
  stage: OpportunityStage;
  amount: { toString(): string } | null;
  currency: string | null;
  expectedCloseDate: Date | null;
}): OpportunityView {
  return {
    id: o.id,
    accountId: o.accountId,
    title: o.title,
    stage: o.stage,
    amount: o.amount ? o.amount.toString() : null,
    currency: o.currency,
    expectedCloseDate: o.expectedCloseDate ? o.expectedCloseDate.toISOString() : null,
  };
}

export class CrmService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parties: PartyGate,
  ) {}

  // --- Accounts (CRM-002) ---

  async listAccounts(ctx: RequestContext): Promise<Array<AccountView & { partyName: string }>> {
    const accounts = await this.prisma.crmAccount.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { accountNumber: 'asc' },
      take: 200,
    });
    const named = await Promise.all(
      accounts.map(async (a) => {
        const party = await this.parties.getPartyState(ctx.tenantId, a.partyId);
        return { ...toAccountView(a), partyName: party?.name ?? '(unknown party)' };
      }),
    );
    return named;
  }

  async getAccount(accountId: string, ctx: RequestContext): Promise<AccountView> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', accountId);
    return toAccountView(account);
  }

  /** Creates the commercial account for an existing MDM party. */
  async createAccount(
    input: { partyId: string; creditLimit?: number | undefined },
    ctx: RequestContext,
  ): Promise<AccountView> {
    const party = await this.parties.getPartyState(ctx.tenantId, input.partyId);
    if (!party || !party.exists) throw notFound('Party', input.partyId);
    if (!party.active) {
      throw new DomainError('INVALID_STATE', 'Cannot open an account for a merged party');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.crmAccount.findUnique({
        where: { tenantId_partyId: { tenantId: ctx.tenantId, partyId: input.partyId } },
      });
      if (existing) throw new DomainError('CONFLICT', 'This party already has an account');
      const count = await tx.crmAccount.count({ where: { tenantId: ctx.tenantId } });
      const account = await tx.crmAccount.create({
        data: {
          tenantId: ctx.tenantId,
          partyId: input.partyId,
          accountNumber: `AC-${String(count + 1).padStart(5, '0')}`,
          ownerUserId: ctx.userId ?? null,
          ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.account.create',
        objectType: 'CrmAccount',
        objectId: account.id,
        source: 'api',
        newValues: { partyId: input.partyId, accountNumber: account.accountNumber },
      });
      return toAccountView(account);
    });
  }

  // --- Leads (CRM-001) ---

  async listLeads(ctx: RequestContext): Promise<LeadView[]> {
    const leads = await this.prisma.lead.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return leads.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company,
      email: l.email,
      phone: l.phone,
      source: l.source,
      status: l.status,
      convertedAccountId: l.convertedAccountId,
      convertedOpportunityId: l.convertedOpportunityId,
    }));
  }

  async createLead(
    input: {
      name: string;
      company?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
      source?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<LeadView> {
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name.trim(),
        company: input.company ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? null,
        ownerUserId: ctx.userId ?? null,
      },
    });
    return {
      id: lead.id,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      convertedAccountId: null,
      convertedOpportunityId: null,
    };
  }

  async disqualifyLead(leadId: string, ctx: RequestContext): Promise<void> {
    const flipped = await this.prisma.lead.updateMany({
      where: { id: leadId, tenantId: ctx.tenantId, status: { in: ['NEW', 'QUALIFIED'] } },
      data: { status: 'DISQUALIFIED' },
    });
    if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'Lead cannot be disqualified');
  }

  /**
   * Converts a lead: creates the MDM party (through MDM's public interface),
   * opens an account and an opportunity, and marks the lead CONVERTED —
   * atomically from the caller's perspective, guarded against double
   * conversion.
   */
  async convertLead(
    leadId: string,
    input: { opportunityTitle?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ accountId: string; opportunityId: string }> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: ctx.tenantId },
    });
    if (!lead) throw notFound('Lead', leadId);
    if (lead.status === 'CONVERTED' || lead.status === 'DISQUALIFIED') {
      throw new DomainError('INVALID_STATE', `Lead is already ${lead.status}`);
    }
    // Claim the lead first (guarded flip = no double conversion under retry).
    const claimed = await this.prisma.lead.updateMany({
      where: { id: leadId, tenantId: ctx.tenantId, status: { in: ['NEW', 'QUALIFIED'] } },
      data: { status: 'CONVERTED' },
    });
    if (claimed.count === 0) throw new DomainError('CONFLICT', 'Lead was converted concurrently');

    const partyName = lead.company ?? lead.name;
    const { partyId } = await this.parties.createOrganization(
      ctx.tenantId,
      partyName,
      lead.email ?? undefined,
    );
    const account = await this.createAccount({ partyId }, ctx);
    const opportunity = await this.createOpportunity(
      { accountId: account.id, title: input.opportunityTitle ?? `Deal with ${partyName}` },
      ctx,
    );
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { convertedAccountId: account.id, convertedOpportunityId: opportunity.id },
    });
    return { accountId: account.id, opportunityId: opportunity.id };
  }

  // --- Opportunities (CRM-003) ---

  async listOpportunities(
    filter: { accountId?: string | undefined },
    ctx: RequestContext,
  ): Promise<OpportunityView[]> {
    const opportunities = await this.prisma.opportunity.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return opportunities.map(toOpportunityView);
  }

  async createOpportunity(
    input: {
      accountId: string;
      title: string;
      amount?: number | undefined;
      currency?: string | undefined;
      expectedCloseDate?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<OpportunityView> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', input.accountId);
    const opportunity = await this.prisma.opportunity.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: input.accountId,
        title: input.title.trim(),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        currency: input.currency ?? null,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
        ownerUserId: ctx.userId ?? null,
      },
    });
    return toOpportunityView(opportunity);
  }

  /** State-machine transition; WON/LOST are terminal and stamped closedAt. */
  async moveOpportunity(
    opportunityId: string,
    stage: OpportunityStage,
    ctx: RequestContext,
  ): Promise<OpportunityView> {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, tenantId: ctx.tenantId },
    });
    if (!opportunity) throw notFound('Opportunity', opportunityId);
    if (!STAGE_FLOW[opportunity.stage].includes(stage)) {
      throw new DomainError(
        'INVALID_STATE',
        `Cannot move opportunity from ${opportunity.stage} to ${stage}`,
      );
    }
    const flipped = await this.prisma.opportunity.updateMany({
      where: { id: opportunityId, tenantId: ctx.tenantId, stage: opportunity.stage },
      data: {
        stage,
        ...(stage === 'WON' || stage === 'LOST' ? { closedAt: new Date() } : {}),
      },
    });
    if (flipped.count === 0) throw new DomainError('CONFLICT', 'Opportunity changed concurrently');
    return this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.opportunity.move',
        objectType: 'Opportunity',
        objectId: opportunityId,
        source: 'api',
        newValues: { from: opportunity.stage, to: stage },
      });
      const updated = await tx.opportunity.findFirst({
        where: { id: opportunityId, tenantId: ctx.tenantId },
      });
      return toOpportunityView(updated as NonNullable<typeof updated>);
    });
  }

  // --- Activities (CRM-004/010) ---

  async listActivities(
    filter: { accountId?: string | undefined; opportunityId?: string | undefined },
    ctx: RequestContext,
  ): Promise<ActivityView[]> {
    const activities = await this.prisma.crmActivity.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    return activities.map((a) => ({
      id: a.id,
      accountId: a.accountId,
      opportunityId: a.opportunityId,
      activityType: a.activityType,
      subject: a.subject,
      body: a.body,
      occurredAt: a.occurredAt.toISOString(),
    }));
  }

  async logActivity(
    input: {
      accountId?: string | undefined;
      opportunityId?: string | undefined;
      activityType: CrmActivityType;
      subject: string;
      body?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ActivityView> {
    if (!input.accountId && !input.opportunityId) {
      throw new DomainError('VALIDATION_FAILED', 'An activity needs an account or an opportunity');
    }
    const activity = await this.prisma.crmActivity.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: input.accountId ?? null,
        opportunityId: input.opportunityId ?? null,
        activityType: input.activityType,
        subject: input.subject.trim(),
        body: input.body ?? null,
        createdBy: ctx.userId ?? null,
      },
    });
    return {
      id: activity.id,
      accountId: activity.accountId,
      opportunityId: activity.opportunityId,
      activityType: activity.activityType,
      subject: activity.subject,
      body: activity.body,
      occurredAt: activity.occurredAt.toISOString(),
    };
  }

  /** Cross-domain gate used by CPQ: account existence/blocked state. */
  async getAccountState(
    tenantId: string,
    accountId: string,
  ): Promise<{ exists: boolean; active: boolean }> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId },
    });
    if (!account) return { exists: false, active: false };
    return { exists: true, active: account.status === 'ACTIVE' };
  }

  /** Emits customer.approved when an account is (re)activated — reserved for onboarding flows. */
  protected async emitCustomerApproved(accountId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.CUSTOMER_APPROVED,
        aggregateType: 'CrmAccount',
        aggregateId: accountId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { accountId },
      });
    });
  }
}
