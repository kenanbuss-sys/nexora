'use client';

/**
 * Active legal-entity context, shared across pages. The choice is a
 * per-user convenience persisted in the browser only — every API call
 * still names the legal entity explicitly and the server enforces
 * tenant and permission boundaries regardless of this value.
 */
const KEY = 'nexora.legalEntityId';

export function getStoredLegalEntity(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeLegalEntity(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the selection simply does not persist.
  }
}
