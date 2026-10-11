'use client';

import { useParams } from 'next/navigation';
import { LookupStatus, PublicFrame, usePublicLookup } from '../../public-lookup';

/**
 * Public revers (custody) lookup (Sprint 238, EAM-016): the QR on a
 * printed revers shows its items and whether each was returned — no
 * employee name or internal ids.
 */
interface PublicCustody {
  organization: string;
  custodyNumber: string;
  status: string;
  issuedOn: string;
  items: Array<{ assetNumber: string; name: string; returned: boolean }>;
}

const STATUS_LABEL: Record<string, [string, string]> = {
  OPEN: ['Zaduženo', 'badge-info'],
  PARTIALLY_RETURNED: ['Djelimično vraćeno', 'badge-warn'],
  CLOSED: ['Razduženo', 'badge-ok'],
};

export default function PublicCustodyPage() {
  const params = useParams<{ token: string }>();
  const state = usePublicLookup<PublicCustody>('custody', params.token ?? '');

  if (state.kind !== 'ok') {
    return (
      <PublicFrame title="Provjera reversa">
        <LookupStatus state={state} />
      </PublicFrame>
    );
  }
  const c = state.data;
  const status = STATUS_LABEL[c.status] ?? [c.status, 'badge-info'];
  return (
    <PublicFrame title="Provjera reversa" organization={c.organization}>
      <div className="fact">
        <span>Broj</span>
        <span className="mono">{c.custodyNumber}</span>
      </div>
      <div className="fact">
        <span>Datum</span>
        <span className="mono">{c.issuedOn}</span>
      </div>
      <div className="fact">
        <span>Status</span>
        <span className={`badge ${status[1]}`}>{status[0]}</span>
      </div>
      <h3 style={{ marginTop: 16, marginBottom: 6 }}>Stavke</h3>
      {c.items.length === 0 ? (
        <div className="empty">Revers nema stavki.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {c.items.map((i) => (
            <li key={i.assetNumber} className="fact">
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <span className="mono">{i.assetNumber}</span> — {i.name}
              </span>
              <span className={`badge ${i.returned ? 'badge-ok' : 'badge-info'}`}>
                {i.returned ? 'Vraćeno' : 'Zaduženo'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PublicFrame>
  );
}
