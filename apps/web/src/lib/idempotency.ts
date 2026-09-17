'use client';

/**
 * Sprint 222: does an API error BUSINESS-UNAMBIGUOUSLY resolve a pending
 * idempotent submission, so its key and content may be discarded?
 *
 * Only a definitive atomic rejection resolves it: the server validated
 * and refused, so no order exists under the key and a corrected cart may
 * start a fresh intent. Everything else keeps the key and the submitted
 * content for a safe continuation — never silently minting a new intent:
 * - CONFLICT (409): the key exists (different content, or a concurrent
 *   identical submission still in flight) — the order's fate is bound to
 *   this key;
 * - 401/403: authorization problem, the order may still be placeable
 *   after signing in again;
 * - 429 / unknown codes / 5xx / network: outcome unknown or retriable.
 */
const RESOLVING_CODES = new Set(['VALIDATION_FAILED', 'INVALID_STATE', 'NOT_FOUND']);

export function submissionResolvedByError(status: number, code: string): boolean {
  return status < 500 && RESOLVING_CODES.has(code);
}
