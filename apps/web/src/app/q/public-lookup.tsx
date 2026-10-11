'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Anonymous QR lookup helpers (Sprint 238, EAM-016). A plain same-origin
 * fetch through the /backend proxy — deliberately WITHOUT the app's
 * session token or 401 redirect: the token in the URL is the only key and
 * the server returns strictly non-sensitive fields.
 */

export type LookupState<T> =
  { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'invalid' } | { kind: 'error' };

export function usePublicLookup<T>(kind: 'asset' | 'custody', token: string): LookupState<T> {
  const [state, setState] = useState<{ token: string; value: LookupState<T> } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/backend/api/v1/public/qr/${kind}/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      credentials: 'omit',
    })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404 || r.status === 400) {
          setState({ token, value: { kind: 'invalid' } });
          return;
        }
        if (!r.ok) {
          setState({ token, value: { kind: 'error' } });
          return;
        }
        const data = (await r.json()) as T;
        if (alive) setState({ token, value: { kind: 'ok', data } });
      })
      .catch(() => {
        if (alive) setState({ token, value: { kind: 'error' } });
      });
    return () => {
      alive = false;
    };
  }, [kind, token]);

  return state && state.token === token ? state.value : { kind: 'loading' };
}

/** Minimal mobile-first card frame shared by both public pages. */
export function PublicFrame({
  title,
  organization,
  children,
}: {
  title: string;
  organization?: string | undefined;
  children: ReactNode;
}) {
  return (
    <main className="page" style={{ maxWidth: 520, margin: '0 auto' }}>
      {organization ? (
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 12.5 }}>
          {organization}
        </p>
      ) : null}
      <h1>{title}</h1>
      <div className="card">{children}</div>
      <p style={{ textAlign: 'center', fontSize: 12.5 }}>
        <a href="/login" className="muted">
          Prijava
        </a>
      </p>
    </main>
  );
}

export function LookupStatus({ state }: { state: LookupState<unknown> }) {
  if (state.kind === 'loading') return <div className="loading">Provjera oznake…</div>;
  if (state.kind === 'invalid')
    return (
      <div className="alert alert-error" role="alert">
        Oznaka nije važeća ili je opozvana.
      </div>
    );
  if (state.kind === 'error')
    return (
      <div className="alert alert-error" role="alert">
        Provjera trenutno nije dostupna. Pokušajte ponovo kasnije.
      </div>
    );
  return null;
}
