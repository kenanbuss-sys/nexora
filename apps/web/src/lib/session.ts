'use client';

/**
 * Client-side session storage for the dev auth mode.
 *
 * The token is an HMAC-signed dev identity token minted by the /api/session
 * route handler (the signing secret never reaches the browser). The API is
 * the sole authority for authorization; the UI stores only what it needs to
 * attach a Bearer token and to render who is signed in.
 */
export interface Session {
  token: string;
  tenantSlug: string;
  subject: string;
  email?: string;
  platformAdmin: boolean;
}

const KEY = 'nexora.session';

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY);
}
