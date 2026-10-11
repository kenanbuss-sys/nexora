'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { ConfirmDialog, ErrorState, LoadingState } from '../../../components/ui';
import {
  eamErrorText,
  Fact,
  isoDay,
  usePrint,
  useQrDataUri,
  type EquipmentAssetView,
} from './equipment-common';

/**
 * Lokacija, trenutni zadužilac i QR oznaka sredstva (Sprint 238,
 * EAM-015/016). Token generiše/rotira/opoziva server (asset.manage);
 * javna provjera po tokenu otkriva samo neosjetljive podatke. Štampa
 * naljepnice se auditira prije otvaranja dijaloga za štampu.
 */

type QrAction = 'issue' | 'rotate' | 'revoke';

const QR_ACTION: Record<QrAction, { title: string; consequence: string; label: string }> = {
  issue: {
    title: 'Generisanje QR oznake',
    consequence:
      'Generiše se jedinstveni token; svako ko skenira oznaku vidi broj, naziv, kategoriju, status, lokaciju i da li je sredstvo zaduženo (bez imena).',
    label: 'Generiši',
  },
  rotate: {
    title: 'Zamjena QR oznake',
    consequence:
      'Generiše se novi token — STARE ODŠTAMPANE NALJEPNICE PRESTAJU RADITI i moraju se zamijeniti novim.',
    label: 'Zamijeni token',
  },
  revoke: {
    title: 'Opoziv QR oznake',
    consequence:
      'Token se opoziva — postojeće naljepnice prestaju raditi (javna provjera javlja da oznaka nije važeća).',
    label: 'Opozovi',
  },
};

export function AssetEquipment({
  assetId,
  retired,
  canManage,
  onOpenCustody,
}: {
  assetId: string;
  /** Retired assets cannot get a QR token (server answers 409). */
  retired: boolean;
  canManage: boolean;
  onOpenCustody: (custodyId: string) => void;
}) {
  const [view, setView] = useState<EquipmentAssetView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [qrAction, setQrAction] = useState<QrAction | null>(null);
  const { print, portal, printing } = usePrint();

  const load = useCallback(() => {
    api<EquipmentAssetView>('GET', `/api/v1/equipment/assets/${assetId}`)
      .then((r) => {
        setView(r);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(eamErrorText(e)));
  }, [assetId]);
  useEffect(load, [load]);

  const labelUrl =
    view?.qrToken && typeof window !== 'undefined'
      ? `${window.location.origin}/q/a/${encodeURIComponent(view.qrToken)}`
      : null;
  const qr = useQrDataUri(labelUrl);

  async function run(fn: () => Promise<void>, successText: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
    } catch (e: unknown) {
      setError(eamErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function printLabel(v: EquipmentAssetView, url: string, qrUri: string | null) {
    setError(null);
    try {
      await print({ assetId: v.assetId }, 'LABEL', <LabelPrint view={v} url={url} qrUri={qrUri} />);
    } catch (e: unknown) {
      setError(`Štampa nije evidentirana, pa nije pokrenuta: ${eamErrorText(e)}`);
    }
  }

  if (loadError) return <ErrorState text={loadError} />;
  if (!view) return <LoadingState text="Učitavanje lokacije i oznake…" />;

  return (
    <>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <Fact label="Lokacija">
        {location === null ? (
          <span>
            {view.location ?? <span className="muted">nije unesena</span>}
            {canManage ? (
              <>
                {' '}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => setLocation(view.location ?? '')}
                >
                  Uredi
                </button>
              </>
            ) : null}
          </span>
        ) : null}
      </Fact>
      {location !== null ? (
        <form
          className="row"
          style={{ marginTop: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('POST', `/api/v1/equipment/assets/${assetId}/details`, {
                location: location.trim() ? location.trim() : null,
              });
              setLocation(null);
              load();
            }, 'Lokacija je sačuvana.');
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 260 }}
            aria-label="Lokacija sredstva"
            placeholder="npr. Hala 2, regal B"
            maxLength={200}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
            Sačuvaj
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => setLocation(null)}
          >
            Odustani
          </button>
        </form>
      ) : null}

      <Fact label="Trenutno zaduženo kod">
        {view.custody ? (
          <span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => view.custody && onOpenCustody(view.custody.custodyId)}
              title="Otvori revers"
            >
              <span className="mono">{view.custody.custodyNumber}</span>
            </button>{' '}
            <span className="mono muted" style={{ fontSize: 12 }}>
              od {isoDay(view.custody.issuedAt)}
            </span>
          </span>
        ) : (
          <span className="muted">nije zaduženo</span>
        )}
      </Fact>

      <h3 style={{ marginTop: 16, marginBottom: 6 }}>QR oznaka</h3>
      {!view.qrToken ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
          Sredstvo nema aktivnu QR oznaku.
        </p>
      ) : labelUrl ? (
        <div className="row" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
          {qr.uri ? (
            <img src={qr.uri} width={120} height={120} alt={`QR oznaka ${view.assetNumber}`} />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div className="mono" style={{ fontWeight: 650 }}>
              {view.assetNumber}
            </div>
            <div>{view.name}</div>
            <div
              className="mono muted"
              style={{ fontSize: 11, wordBreak: 'break-all', marginTop: 4 }}
            >
              {labelUrl}
            </div>
          </div>
        </div>
      ) : null}
      <div className="row">
        {view.qrToken && labelUrl ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={printing || (!qr.uri && !qr.failed)}
            title={!qr.uri && !qr.failed ? 'QR kod se još generiše' : undefined}
            onClick={() => void printLabel(view, labelUrl, qr.uri)}
          >
            Štampaj naljepnicu
          </button>
        ) : null}
        {canManage ? (
          view.qrToken ? (
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy || retired}
                title={retired ? 'Rashodovano sredstvo ne dobija novu QR oznaku' : undefined}
                onClick={() => setQrAction('rotate')}
              >
                Zamijeni token
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => setQrAction('revoke')}
              >
                Opozovi
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || retired}
              title={retired ? 'Rashodovano sredstvo ne dobija QR oznaku' : undefined}
              onClick={() => setQrAction('issue')}
            >
              Generiši QR oznaku
            </button>
          )
        ) : null}
      </div>

      {canManage && retired ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Rashodovano sredstvo ne može dobiti QR oznaku; rashodovanjem se postojeća oznaka
          poništava.
        </p>
      ) : null}

      {qrAction ? (
        <ConfirmDialog
          open
          title={QR_ACTION[qrAction].title}
          consequence={QR_ACTION[qrAction].consequence}
          confirmLabel={QR_ACTION[qrAction].label}
          danger={qrAction !== 'issue'}
          busy={busy}
          onCancel={() => setQrAction(null)}
          onConfirm={() => {
            const action = qrAction;
            void run(
              async () => {
                await api(
                  'POST',
                  action === 'revoke'
                    ? `/api/v1/equipment/assets/${assetId}/qr/revoke`
                    : `/api/v1/equipment/assets/${assetId}/qr`,
                  action === 'revoke' ? {} : { rotate: action === 'rotate' },
                );
                setQrAction(null);
                load();
              },
              action === 'revoke'
                ? 'QR oznaka je opozvana.'
                : action === 'rotate'
                  ? 'Token je zamijenjen — odštampajte novu naljepnicu.'
                  : 'QR oznaka je generisana.',
            );
          }}
        >
          <Fact label="Sredstvo">
            {view.assetNumber} — {view.name}
          </Fact>
        </ConfirmDialog>
      ) : null}

      {portal}
    </>
  );
}

/** Print-only asset label (mounted only while printing). */
function LabelPrint({
  view,
  url,
  qrUri,
}: {
  view: EquipmentAssetView;
  url: string;
  qrUri: string | null;
}) {
  return (
    <div
      style={{
        width: '70mm',
        padding: '4mm',
        border: '1px solid var(--color-text)',
        display: 'flex',
        gap: '3mm',
        alignItems: 'center',
      }}
    >
      {qrUri ? <img src={qrUri} alt="QR oznaka" style={{ width: '26mm', height: '26mm' }} /> : null}
      <div style={{ minWidth: 0 }}>
        <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
          {view.assetNumber}
        </div>
        <div style={{ fontSize: 12 }}>{view.name}</div>
        {qrUri ? null : (
          <div className="mono" style={{ fontSize: 8, wordBreak: 'break-all' }}>
            {url}
          </div>
        )}
      </div>
    </div>
  );
}
