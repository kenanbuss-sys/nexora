'use client';

import { clearSession, getSession } from './session';

/** Canonical error shape produced by the API's error filter. */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Fetch against the same-origin /backend proxy (no CORS). Attaches the dev
 * Bearer token; a 401 clears the session and sends the person to sign in.
 */
export async function api<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (session) headers.authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`/backend${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    const err = (parsed ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(response.status, {
      code: err.code ?? 'UNKNOWN',
      message: err.message ?? `Request failed (${response.status})`,
      details: err.details,
    });
  }
  return parsed as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.body.code === 'FORBIDDEN') {
      return 'You do not have permission for this action. Ask an administrator to grant it.';
    }
    return e.body.message;
  }
  return e instanceof Error ? e.message : 'Unexpected error';
}
