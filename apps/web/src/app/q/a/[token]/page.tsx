'use client';

import { useParams } from 'next/navigation';
import { LookupStatus, PublicFrame, usePublicLookup } from '../../public-lookup';

/**
 * Public asset label lookup (Sprint 238, EAM-016): what a scanned QR label
 * shows without login — no names, values, serials or internal ids. The
 * location is shown only if the tenant enabled it (otherwise null).
 */
interface PublicAsset {
  organization: string;
  assetNumber: string;
  name: string;
  category: string;
  status: string;
  location: string | null;
  issued: boolean;
}

export default function PublicAssetPage() {
  const params = useParams<{ token: string }>();
  const state = usePublicLookup<PublicAsset>('asset', params.token ?? '');

  if (state.kind !== 'ok') {
    return (
      <PublicFrame title="Provjera sredstva">
        <LookupStatus state={state} />
      </PublicFrame>
    );
  }
  const a = state.data;
  return (
    <PublicFrame title="Provjera sredstva" organization={a.organization}>
      <div className="fact">
        <span>Broj</span>
        <span className="mono">{a.assetNumber}</span>
      </div>
      <div className="fact">
        <span>Naziv</span>
        <span>{a.name}</span>
      </div>
      <div className="fact">
        <span>Kategorija</span>
        <span>{a.category}</span>
      </div>
      <div className="fact">
        <span>Status</span>
        <span>{a.status}</span>
      </div>
      {a.location ? (
        <div className="fact">
          <span>Lokacija</span>
          <span>{a.location}</span>
        </div>
      ) : null}
      <div className="fact">
        <span>Zaduženo</span>
        <span className={`badge ${a.issued ? 'badge-info' : 'badge-ok'}`}>
          {a.issued ? 'Da' : 'Ne'}
        </span>
      </div>
    </PublicFrame>
  );
}
