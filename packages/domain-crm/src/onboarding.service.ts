import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Customer onboarding (CRM-012). Starting onboarding for an account
 * creates a checklist of tasks through the CORE task engine — the
 * steps come from tenant configuration (crm.onboardingSteps, versioned
 * like all important configuration) with a sensible default. Progress
 * derives live from the tasks; starting twice is a CONFLICT.
 */

export const DEFAULT_ONBOARDING_STEPS = [
  'Verify company and tax data',
  'Record GDPR consents',
  'Agree payment terms and credit limit',
  'Assign territory and sales owner',
  'Introductory call',
];

/** Cross-domain contract: tasks are owned by CORE. */
export interface TaskGate {
  createTask(
    input: {
      title: string;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

/** Cross-domain contract: effective configuration is owned by CORE. */
export interface ConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
}

export interface OnboardingStatus {
  accountId: string;
  started: boolean;
  total: number;
  done: number;
  tasks: Array<{ id: string; title: string; status: string }>;
}

export class OnboardingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tasks: TaskGate,
    private readonly config: ConfigGate,
  ) {}

  private async steps(tenantId: string): Promise<string[]> {
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const fromConfig = (config as { crm?: { onboardingSteps?: unknown } })?.crm?.onboardingSteps;
      if (
        Array.isArray(fromConfig) &&
        fromConfig.length > 0 &&
        fromConfig.length <= 20 &&
        fromConfig.every((s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 200)
      ) {
        return fromConfig.map((s) => s.trim());
      }
    } catch {
      // fall through to the default checklist
    }
    return DEFAULT_ONBOARDING_STEPS;
  }

  async status(accountId: string, ctx: RequestContext): Promise<OnboardingStatus> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', accountId);
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        relatedObjectType: 'crm_onboarding',
        relatedObjectId: accountId,
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return {
      accountId,
      started: tasks.length > 0,
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'DONE').length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    };
  }

  async start(accountId: string, ctx: RequestContext): Promise<OnboardingStatus> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', accountId);
    const existing = await this.prisma.task.count({
      where: {
        tenantId: ctx.tenantId,
        relatedObjectType: 'crm_onboarding',
        relatedObjectId: accountId,
      },
    });
    if (existing > 0) {
      throw new DomainError('CONFLICT', 'Onboarding was already started for this account');
    }
    const steps = await this.steps(ctx.tenantId);
    for (const title of steps) {
      await this.tasks.createTask(
        { title, relatedObjectType: 'crm_onboarding', relatedObjectId: accountId },
        ctx,
      );
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'crm.onboarding.start',
      objectType: 'CrmAccount',
      objectId: accountId,
      source: 'api',
      newValues: { steps: steps.length },
    });
    return this.status(accountId, ctx);
  }
}
