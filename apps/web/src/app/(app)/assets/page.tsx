'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

/**
 * Oprema i održavanje (Sprint 229, EAM): lista i detalj sredstava,
 * kvarovi → održavanje → završetak s troškom, zaduženje alata (upisom
 * imena — model NEMA lokaciju ni FK na zaposlenog; FinTrack QR/zaduženja
 * NISU pokriveni ovim ekranom i ostaju u backlogu) i preventivni ciklus.
 */

interface AssetView {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  serialNumber: string | null;
  status: 'IN_SERVICE' | 'UNDER_MAINTENANCE' | 'RETIRED';
  value: string | null;
  purchasedAt: string | null;
}

interface AssetReport {
  assetNumber: string;
  maintenanceCost: string;
  completions: number;
  breakdowns: number;
  warrantyUntil: string | null;
  warrantyExpired: boolean | null;
}

const STATUS_META: Record<AssetView['status'], [string, string]> = {
  IN_SERVICE: ['U upotrebi', 'badge-ok'],
  UNDER_MAINTENANCE: ['Na održavanju', 'badge-warn'],
  RETIRED: ['Rashodovano', 'badge-danger'],
};

export default function AssetsPage() {
  const { can } = useApp();
  const canRead = can('asset.read');
  const canManage = can('asset.manage');

  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [report, setReport] = useState<AssetReport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [serial, setSerial] = useState('');
  const [value, setValue] = useState('');

  const [breakdownFor, setBreakdownFor] = useState<AssetView | null>(null);
  const [breakdownText, setBreakdownText] = useState('');
  const [completeFor, setCompleteFor] = useState<AssetView | null>(null);
  const [laborHours, setLaborHours] = useState('1');
  const [laborRate, setLaborRate] = useState('30');
  const [checkoutFor, setCheckoutFor] = useState<{ asset: AssetView; event: 'OUT' | 'IN' } | null>(
    null,
  );
  const [holder, setHolder] = useState('');
  const [retireFor, setRetireFor] = useState<AssetView | null>(null);
  const [confirmPreventive, setConfirmPreventive] = useState(false);

  const load = useCallback(() => {
    if (!canRead) return;
    api<{ assets: AssetView[] }>('GET', '/api/v1/assets')
      .then((r) => {
        setAssets(r.assets);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [canRead]);
  useEffect(load, [load]);

  const openAsset = useCallback((id: string) => {
    setSelectedId(id);
    setReport(null);
    api<AssetReport>('GET', `/api/v1/maintenance/assets/${id}/report`)
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
      if (selectedId) openAsset(selectedId);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const selected = (assets ?? []).find((a) => a.id === selectedId) ?? null;
  const filtered = (assets ?? []).filter(
    (a) => statusFilter === 'ALL' || a.status === statusFilter,
  );

  const columns: Array<Column<AssetView>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (a) => <span className="mono">{a.assetNumber}</span>,
      text: (a) => a.assetNumber,
    },
    { key: 'name', header: 'Naziv', render: (a) => a.name, text: (a) => a.name },
    { key: 'category', header: 'Kategorija', render: (a) => a.category, text: (a) => a.category },
    {
      key: 'serial',
      header: 'Serijski broj',
      render: (a) => (a.serialNumber ? <span className="mono">{a.serialNumber}</span> : '—'),
      text: (a) => a.serialNumber ?? '',
    },
    {
      key: 'value',
      header: 'Vrijednost',
      align: 'right',
      render: (a) => (a.value ? <span className="mono">{Number(a.value).toFixed(2)}</span> : '—'),
      text: (a) => a.value ?? '',
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (a) => (
        <span className={`badge ${STATUS_META[a.status][1]}`}>{STATUS_META[a.status][0]}</span>
      ),
      text: (a) => STATUS_META[a.status][0],
    },
  ];

  return (
    <main className="page">
      <h1>Oprema i imovina</h1>
      <p className="page-sub">
        Registar sredstava sa servisnim tokom: kvar → održavanje → završetak s troškom, zaduženje
        alata i preventivni ciklus. Troškovi dolaze iz stvarnih zapisa održavanja.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {!canRead ? (
        <EmptyState text="Nemate pristup imovini — zatražite od administratora ulogu s dozvolom asset.read." />
      ) : (
        <div className="grid-2">
          <div className="card">
            <h2>Sredstva</h2>
            <div className="row" style={{ marginBottom: 8 }}>
              <select
                className="select"
                style={{ maxWidth: 190 }}
                aria-label="Filter statusa sredstva"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Svi statusi</option>
                <option value="IN_SERVICE">U upotrebi</option>
                <option value="UNDER_MAINTENANCE">Na održavanju</option>
                <option value="RETIRED">Rashodovana</option>
              </select>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => setConfirmPreventive(true)}
                >
                  Pokreni preventivno održavanje
                </button>
              ) : null}
            </div>
            {assets === null ? (
              <LoadingState text="Učitavanje sredstava…" />
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(a) => a.id}
                onRowClick={(a) => openAsset(a.id)}
                searchPlaceholder="Pretraga sredstava…"
                emptyText="Još nema evidentiranih sredstava."
              />
            )}

            {canManage ? (
              <form
                style={{ marginTop: 14 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api('POST', '/api/v1/assets', {
                      name,
                      category,
                      ...(serial ? { serialNumber: serial } : {}),
                      ...(value ? { value: Number(value) } : {}),
                    });
                    setName('');
                    setCategory('');
                    setSerial('');
                    setValue('');
                  }, 'Sredstvo je dodano u registar.');
                }}
              >
                <h3 style={{ marginBottom: 6 }}>Novo sredstvo</h3>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ maxWidth: 220 }}
                    placeholder="Naziv"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 150 }}
                    placeholder="Kategorija"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 160 }}
                    placeholder="Serijski (opcionalno)"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 120 }}
                    type="number"
                    step="0.01"
                    placeholder="Vrijednost"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                    Dodaj sredstvo
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Detalj sredstva</h2>
            {!selected ? (
              <EmptyState text="Odaberite sredstvo iz registra." />
            ) : (
              <>
                <div className="fact">
                  <span>Broj</span>
                  <span className="mono">{selected.assetNumber}</span>
                </div>
                <div className="fact">
                  <span>Naziv</span>
                  <span>{selected.name}</span>
                </div>
                <div className="fact">
                  <span>Kategorija</span>
                  <span>{selected.category}</span>
                </div>
                <div className="fact">
                  <span>Status</span>
                  <span className={`badge ${STATUS_META[selected.status][1]}`}>
                    {STATUS_META[selected.status][0]}
                  </span>
                </div>

                <h3 style={{ marginTop: 16, marginBottom: 6 }}>Servisna historija</h3>
                {report === null ? (
                  <LoadingState text="Učitavanje izvještaja…" />
                ) : (
                  <>
                    <div className="fact">
                      <span>Prijavljeni kvarovi</span>
                      <span className="mono">{report.breakdowns}</span>
                    </div>
                    <div className="fact">
                      <span>Završena održavanja</span>
                      <span className="mono">{report.completions}</span>
                    </div>
                    <div className="fact">
                      <span>Ukupni trošak održavanja</span>
                      <span className="mono">{Number(report.maintenanceCost).toFixed(2)} EUR</span>
                    </div>
                    {report.warrantyUntil ? (
                      <div className="fact">
                        <span>Garancija</span>
                        <span>
                          <span className="mono">{report.warrantyUntil}</span>{' '}
                          {report.warrantyExpired ? (
                            <span className="badge badge-danger">Istekla</span>
                          ) : (
                            <span className="badge badge-ok">Važi</span>
                          )}
                        </span>
                      </div>
                    ) : null}
                  </>
                )}

                {canManage ? (
                  <>
                    <h3 style={{ marginTop: 16, marginBottom: 6 }}>Radnje</h3>
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={busy || selected.status !== 'IN_SERVICE'}
                        title={
                          selected.status !== 'IN_SERVICE'
                            ? 'Kvar se prijavljuje samo za sredstvo u upotrebi'
                            : undefined
                        }
                        onClick={() => setBreakdownFor(selected)}
                      >
                        Prijavi kvar
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy || selected.status !== 'UNDER_MAINTENANCE'}
                        title={
                          selected.status !== 'UNDER_MAINTENANCE'
                            ? 'Sredstvo nije na održavanju'
                            : undefined
                        }
                        onClick={() => setCompleteFor(selected)}
                      >
                        Završi održavanje
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy || selected.status === 'RETIRED'}
                        onClick={() => setCheckoutFor({ asset: selected, event: 'OUT' })}
                      >
                        Zaduži
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy || selected.status === 'RETIRED'}
                        onClick={() => setCheckoutFor({ asset: selected, event: 'IN' })}
                      >
                        Razduži
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={busy || selected.status === 'RETIRED'}
                        onClick={() => setRetireFor(selected)}
                      >
                        Rashoduj
                      </button>
                    </div>
                    <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      Zaduženje se evidentira upisom imena (auditirano). Model nema lokaciju ni QR
                      zaduženja — evidentirano u backlogu, ne prikazuje se izmišljeno.
                    </p>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {breakdownFor ? (
        <ConfirmDialog
          open
          title="Prijava kvara"
          consequence="Sredstvo prelazi na održavanje, otvara se zadatak i počinje mjerenje zastoja (auditirano)."
          confirmLabel="Prijavi kvar"
          danger
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/maintenance/assets/${breakdownFor.id}/breakdown`, {
                description: breakdownText,
              });
              setBreakdownFor(null);
              setBreakdownText('');
            }, 'Kvar je prijavljen — sredstvo je na održavanju.')
          }
          onCancel={() => setBreakdownFor(null)}
        >
          <div className="fact">
            <span>Sredstvo</span>
            <span>
              {breakdownFor.assetNumber} — {breakdownFor.name}
            </span>
          </div>
          <label className="label" htmlFor="bd-desc">
            Opis kvara
          </label>
          <input
            id="bd-desc"
            className="input"
            placeholder="npr. Ploter ne uvlači papir"
            value={breakdownText}
            onChange={(e) => setBreakdownText(e.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {completeFor ? (
        <ConfirmDialog
          open
          title="Završetak održavanja"
          consequence="Sredstvo se vraća u upotrebu; trošak rada ulazi u servisnu historiju (idempotentno po ključu)."
          confirmLabel="Završi održavanje"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/maintenance/assets/${completeFor.id}/complete`, {
                completionKey: `ui-${completeFor.id}-${Date.now()}`,
                laborHours: Number(laborHours) || 0,
                laborRate: Number(laborRate) || 0,
              });
              setCompleteFor(null);
            }, 'Održavanje je završeno — sredstvo je u upotrebi.')
          }
          onCancel={() => setCompleteFor(null)}
        >
          <div className="fact">
            <span>Sredstvo</span>
            <span>
              {completeFor.assetNumber} — {completeFor.name}
            </span>
          </div>
          <label className="label" htmlFor="mh">
            Sati rada
          </label>
          <input
            id="mh"
            className="input"
            type="number"
            step="0.5"
            min="0"
            value={laborHours}
            onChange={(e) => setLaborHours(e.target.value)}
          />
          <label className="label" htmlFor="mr">
            Cijena sata (EUR)
          </label>
          <input
            id="mr"
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {checkoutFor ? (
        <ConfirmDialog
          open
          title={checkoutFor.event === 'OUT' ? 'Zaduženje alata' : 'Razduženje alata'}
          consequence={
            checkoutFor.event === 'OUT'
              ? 'Zaduženje se auditira s imenom preuzimaoca.'
              : 'Vraćanje alata se auditira s imenom vraćaoca.'
          }
          confirmLabel={checkoutFor.event === 'OUT' ? 'Zaduži' : 'Razduži'}
          busy={busy}
          onConfirm={() =>
            void run(
              async () => {
                await api('POST', `/api/v1/maintenance/assets/${checkoutFor.asset.id}/checkout`, {
                  event: checkoutFor.event,
                  holder,
                });
                setCheckoutFor(null);
                setHolder('');
              },
              checkoutFor.event === 'OUT' ? 'Alat je zadužen.' : 'Alat je razdužen.',
            )
          }
          onCancel={() => setCheckoutFor(null)}
        >
          <div className="fact">
            <span>Sredstvo</span>
            <span>
              {checkoutFor.asset.assetNumber} — {checkoutFor.asset.name}
            </span>
          </div>
          <label className="label" htmlFor="holder">
            {checkoutFor.event === 'OUT' ? 'Zadužuje (ime i prezime)' : 'Razdužuje (ime i prezime)'}
          </label>
          <input
            id="holder"
            className="input"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {retireFor ? (
        <ConfirmDialog
          open
          title="Rashodovanje sredstva"
          consequence="Rashodovano sredstvo ostaje u evidenciji, ali se više ne koristi u operativnim tokovima."
          confirmLabel="Rashoduj"
          danger
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/assets/${retireFor.id}/transition`, {
                status: 'RETIRED',
              });
              setRetireFor(null);
            }, 'Sredstvo je rashodovano.')
          }
          onCancel={() => setRetireFor(null)}
        >
          <div className="fact">
            <span>Sredstvo</span>
            <span>
              {retireFor.assetNumber} — {retireFor.name}
            </span>
          </div>
          <div className="fact">
            <span>Trenutni status</span>
            <span>{STATUS_META[retireFor.status][0]}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirmPreventive ? (
        <ConfirmDialog
          open
          title="Preventivno održavanje"
          consequence="Za konfigurisane planove kreiraju se zadaci održavanja; već pokriveni intervali se preskaču (idempotentno)."
          confirmLabel="Pokreni ciklus"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              const r = await api<{ created: number; skipped: number }>(
                'POST',
                '/api/v1/maintenance/preventive/run',
                {},
              );
              setConfirmPreventive(false);
              setNotice(`Preventivni ciklus: kreirano ${r.created}, preskočeno ${r.skipped}.`);
            }, null)
          }
          onCancel={() => setConfirmPreventive(false)}
        >
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Pokreće se jedan ciklus preventivnog održavanja prema konfiguraciji tenanta.
          </p>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
