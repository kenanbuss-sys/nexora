import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { findTransition, validateWorkflowSpec, type WorkflowSpec } from './workflow-spec';

/**
 * WF — versioned workflow engine.
 * Published versions are immutable; instances stay pinned to their version.
 */

export interface WorkflowVersionView {
  definitionKey: string;
  version: number;
  spec: WorkflowSpec;
}

export interface WorkflowInstanceView {
  id: string;
  definitionKey: string;
  version: number;
  currentState: string;
  status: 'RUNNING' | 'COMPLETED' | 'CANCELLED';
}

/** Authorization callback supplied by the application layer (default deny). */
export type AuthorizeFn = (permissionKey: string) => Promise<boolean>;

export class WorkflowService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Publish a new immutable version of a workflow (creates the definition on first publish). */
  async publishWorkflow(
    input: { key: string; name: string; spec: unknown },
    ctx: RequestContext,
  ): Promise<WorkflowVersionView> {
    const spec = validateWorkflowSpec(input.spec);
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Workflow key must be kebab-case');
    }
    return this.prisma.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.upsert({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: input.key } },
        create: { tenantId: ctx.tenantId, key: input.key, name: input.name },
        update: { name: input.name },
      });
      const last = await tx.workflowVersion.findFirst({
        where: { definitionId: definition.id },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;
      await tx.workflowVersion.create({
        data: { tenantId: ctx.tenantId, definitionId: definition.id, version, spec },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'workflow.publish',
        objectType: 'WorkflowVersion',
        objectId: `${definition.id}:${version}`,
        source: 'api',
        newValues: { key: input.key, version },
      });
      return { definitionKey: input.key, version, spec };
    });
  }

  /** Start an instance on the LATEST published version; the instance stays pinned to it. */
  async startWorkflow(
    input: {
      definitionKey: string;
      subjectObjectType?: string | undefined;
      subjectObjectId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<WorkflowInstanceView> {
    return this.prisma.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.findFirst({
        where: { tenantId: ctx.tenantId, key: input.definitionKey },
      });
      if (!definition) throw notFound('WorkflowDefinition', input.definitionKey);
      const latest = await tx.workflowVersion.findFirst({
        where: { definitionId: definition.id },
        orderBy: { version: 'desc' },
      });
      if (!latest) throw new DomainError('INVALID_STATE', 'Workflow has no published version');
      const spec = latest.spec as unknown as WorkflowSpec;
      const instance = await tx.workflowInstance.create({
        data: {
          tenantId: ctx.tenantId,
          definitionId: definition.id,
          versionId: latest.id,
          currentState: spec.initial,
          subjectObjectType: input.subjectObjectType ?? null,
          subjectObjectId: input.subjectObjectId ?? null,
        },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.WORKFLOW_STARTED,
        aggregateType: 'WorkflowInstance',
        aggregateId: instance.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { workflowInstanceId: instance.id, definitionVersion: latest.version },
      });
      return {
        id: instance.id,
        definitionKey: definition.key,
        version: latest.version,
        currentState: instance.currentState,
        status: instance.status,
      };
    });
  }

  /**
   * Fire a trigger. The transition must exist on the instance's PINNED version;
   * a transition guarded by a permission is authorized via the callback.
   */
  async transition(
    instanceId: string,
    trigger: string,
    ctx: RequestContext,
    authorize: AuthorizeFn,
  ): Promise<WorkflowInstanceView> {
    // Guard check happens outside the write transaction; the state move itself
    // is concurrency-safe via the guarded updateMany below.
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, tenantId: ctx.tenantId },
      include: { version: true, definition: true },
    });
    if (!instance) throw notFound('WorkflowInstance', instanceId);
    if (instance.status !== 'RUNNING') {
      throw new DomainError('INVALID_STATE', `Workflow instance is ${instance.status}`);
    }
    const spec = instance.version.spec as unknown as WorkflowSpec;
    const match = findTransition(spec, instance.currentState, trigger);
    if (!match) {
      throw new DomainError(
        'INVALID_STATE',
        `Transition "${trigger}" is not allowed from state ${instance.currentState}`,
        { currentState: instance.currentState, trigger },
      );
    }
    if (match.requiredPermission && !(await authorize(match.requiredPermission))) {
      throw new DomainError('FORBIDDEN', 'Missing permission for this transition', {
        permission: match.requiredPermission,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Optimistic guard: only move if still in the observed state.
      const moved = await tx.workflowInstance.updateMany({
        where: { id: instance.id, currentState: instance.currentState, status: 'RUNNING' },
        data: {
          currentState: match.to,
          ...(match.toTerminal ? { status: 'COMPLETED' } : {}),
        },
      });
      if (moved.count === 0) {
        throw new DomainError('CONFLICT', 'Workflow instance changed concurrently; retry');
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'workflow.transition',
        objectType: 'WorkflowInstance',
        objectId: instance.id,
        source: 'api',
        previousValues: { state: instance.currentState },
        newValues: { state: match.to, trigger },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.WORKFLOW_TRANSITIONED,
        aggregateType: 'WorkflowInstance',
        aggregateId: instance.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { workflowInstanceId: instance.id, from: instance.currentState, to: match.to },
      });
      return {
        id: instance.id,
        definitionKey: instance.definition.key,
        version: instance.version.version,
        currentState: match.to,
        status: match.toTerminal ? ('COMPLETED' as const) : ('RUNNING' as const),
      };
    });
  }

  async getInstance(instanceId: string, ctx: RequestContext): Promise<WorkflowInstanceView> {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, tenantId: ctx.tenantId },
      include: { version: true, definition: true },
    });
    if (!instance) throw notFound('WorkflowInstance', instanceId);
    return {
      id: instance.id,
      definitionKey: instance.definition.key,
      version: instance.version.version,
      currentState: instance.currentState,
      status: instance.status,
    };
  }
}
