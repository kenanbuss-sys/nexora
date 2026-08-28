import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Server-resolved tenant/actor context (docs/architecture/06_TENANCY_WHITE_LABEL.md).
 *
 * The context is built ONLY from verified identity claims on the server —
 * never from an arbitrary client-supplied tenant id — and carried through the
 * async execution path so repositories, audit and outbox writers can read it.
 */
export type ActorKind = 'USER' | 'SERVICE' | 'SYSTEM';

export interface RequestContext {
  tenantId: string;
  tenantSlug: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED';
  actorType: ActorKind;
  /** Application user id (absent for platform/service actors). */
  userId?: string | undefined;
  userStatus?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | undefined;
  /** True for verified platform-level operators (tenant provisioning etc.). */
  platformAdmin?: boolean | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Throws when called outside an authenticated request context. */
export function requireRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('No request context: endpoint reached without authentication middleware');
  }
  return ctx;
}
