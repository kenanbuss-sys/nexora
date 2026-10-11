'use client';

import { useEffect, useState } from 'react';
import { api, errorText } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from './ui';

/**
 * MDM-002 — change history of one governed record (party or product).
 * Read-only view over the server's change-request log; the server
 * enforces mdm.read and tenant scope.
 */

interface ChangeRequestView {
  id: string;
  entityType: string;
  entityId: string;
  changeType?: string | null;
  payload: unknown;
  status: string;
  requestedBy?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Na čekanju',
  APPROVED: 'Odobren',
  REJECTED: 'Odbijen',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-warn',
  APPROVED: 'badge-ok',
  REJECTED: 'badge-danger',
};

function summarizePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return '—';
  if (typeof payload !== 'object') return String(payload);
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function ChangeHistoryCard({
  entityType,
  entityId,
  reloadKey,
}: {
  entityType: 'party' | 'product';
  entityId: string;
  reloadKey?: unknown;
}) {
  const [requests, setRequests] = useState<ChangeRequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRequests(null);
    setError(null);
    api<{ requests: ChangeRequestView[] }>(
      'GET',
      `/api/v1/mdm/change-requests?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
    )
      .then((r) => {
        if (!cancelled) setRequests(r.requests);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, reloadKey]);

  return (
    <section aria-label="Istorija promjena">
      <h2>Istorija promjena</h2>
      {error ? <ErrorState text={error} /> : null}
      {!error && requests === null ? <LoadingState text="Učitavanje istorije…" /> : null}
      {requests && requests.length === 0 ? (
        <EmptyState text="Nema zabilježenih zahtjeva za izmjenu ovog zapisa." />
      ) : null}
      {requests && requests.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Status</th>
              <th>Izmjena</th>
              <th>Napomena odluke</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((cr) => (
              <tr key={cr.id}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                  {new Date(cr.createdAt).toLocaleString()}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[cr.status] ?? ''}`}>
                    {STATUS_LABELS[cr.status] ?? cr.status}
                  </span>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {cr.changeType ? <span className="muted">{cr.changeType} · </span> : null}
                  {summarizePayload(cr.payload)}
                </td>
                <td className="muted">{cr.decisionNote || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
