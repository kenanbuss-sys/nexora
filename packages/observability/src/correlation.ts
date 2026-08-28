import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Correlation-ID propagation (docs/operations/01_OBSERVABILITY_SLO.md):
 * every request, job, event and integration run carries a correlation ID.
 *
 * The ID lives in AsyncLocalStorage so any code on the async path — handlers,
 * loggers, outbox writers, audit writers — can read it without plumbing.
 */
export const CORRELATION_HEADER = 'x-correlation-id';

interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/** Run `fn` within a correlation context. Reuses `id` when given (e.g. from an incoming header). */
export function runWithCorrelationId<T>(id: string | undefined, fn: () => T): T {
  const correlationId = id && isValidCorrelationId(id) ? id : randomUUID();
  return storage.run({ correlationId }, fn);
}

/** The correlation ID of the current async context, if any. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** The current correlation ID, or a fresh one when called outside a context. */
export function getOrCreateCorrelationId(): string {
  return getCorrelationId() ?? randomUUID();
}

/** Accept only sane header values; anything else gets replaced by a fresh UUID. */
export function isValidCorrelationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}
