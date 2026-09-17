'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '../../../lib/api';
import { ConfirmDialog, DataTable, EmptyState, LoadingState } from '../../../components/ui';
import { useApp } from '../app-shell';

interface BomLineView {
  id: string;
  description: string;
  quantity: string;
  scrapPct: string;
}

interface BomView {
  id: string;
  skuId: string;
  version: number;
  status: 'DRAFT' | 'RELEASED' | 'OBSOLETE';
  lines: BomLineView[];
}

interface RoutingOperationView {
  id: string;
  seq: number;
  name: string;
  workCenter: string;
  setupMinutes: string;
  runMinutesPerUnit: string;
}

interface RoutingView {
  id: string;
  skuId: string;
  version: number;
  status: 'DRAFT' | 'RELEASED' | 'OBSOLETE';
  operations: RoutingOperationView[];
}

interface ChangeView {
  id: string;
  ecNumber: string;
  targetSkuId: string;
  title: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
}

interface ExplodedComponent {
  skuId: string;
  description: string;
  quantity: string;
  level: number;
}

interface SkuOption {
  id: string;
  code: string;
}

const REV_LABELS: Record<BomView['status'], string> = {
  DRAFT: 'Nacrt',
  RELEASED: 'Puštena',
  OBSOLETE: 'Zastarjela',
};

const REV_BADGE: Record<BomView['status'], string> = {
  DRAFT: 'badge-warn',
  RELEASED: 'badge-ok',
  OBSOLETE: '',
};

const EC_LABELS: Record<ChangeView['status'], string> = {
  OPEN: 'Otvorena',
  APPROVED: 'Odobrena',
  REJECTED: 'Odbijena',
  IMPLEMENTED: 'Implementirana',
};

const EC_BADGE: Record<ChangeView['status'], string> = {
  OPEN: 'badge-warn',
  APPROVED: 'badge-ok',
  REJECTED: 'badge-danger',
  IMPLEMENTED: 'badge-accent',
};

export default function EngineeringPage() {
  const { can } = useApp();
  const [boms, setBoms] = useState<BomView[] | null>(null);
  const [routings, setRoutings] = useState<RoutingView[]>([]);
  const [changes, setChanges] = useState<ChangeView[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [selectedRoutingId, setSelectedRoutingId] = useState<string | null>(null);
  const [confirmReleaseBom, setConfirmReleaseBom] = useState<BomView | null>(null);
  const [confirmReleaseRouting, setConfirmReleaseRouting] = useState<RoutingView | null>(null);

  const [bomSku, setBomSku] = useState('');
  const [lineBom, setLineBom] = useState('');
  const [lineSku, setLineSku] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineScrap, setLineScrap] = useState('0');
  const [routingSku, setRoutingSku] = useState('');
  const [opRouting, setOpRouting] = useState('');
  const [opName, setOpName] = useState('');
  const [opCenter, setOpCenter] = useState('');
  const [opSetup, setOpSetup] = useState('0');
  const [opRun, setOpRun] = useState('1');
  const [ecSku, setEcSku] = useState('');
  const [ecTitle, setEcTitle] = useState('');
  const [explodeSku, setExplodeSku] = useState('');
  const [explodeQty, setExplodeQty] = useState('10');
  const [exploded, setExploded] = useState<ExplodedComponent[] | null>(null);

  const load = useCallback(() => {
    api<{ boms: BomView[] }>('GET', '/api/v1/boms')
      .then((r) => {
        setBoms(r.boms);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ routings: RoutingView[] }>('GET', '/api/v1/routings')
      .then((r) => setRoutings(r.routings))
      .catch(() => setRoutings([]));
    api<{ changes: ChangeView[] }>('GET', '/api/v1/engineering-changes')
      .then((r) => setChanges(r.changes))
      .catch(() => setChanges([]));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ products: Array<{ id: string }> }>('GET', '/api/v1/products/search')
      .then(async (r) => {
        const details = await Promise.all(
          r.products
            .slice(0, 20)
            .map((p) =>
              api<{ skus: Array<{ id: string; code: string }> }>('GET', `/api/v1/products/${p.id}`),
            ),
        );
        setSkus(details.flatMap((d) => d.skus));
      })
      .catch(() => undefined);
    // eslint-disable-next-line
  }, []);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const skuCode = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  const selectedBom = (boms ?? []).find((b) => b.id === selectedBomId) ?? null;
  const selectedRouting = routings.find((r) => r.id === selectedRoutingId) ?? null;

  return (
    <main className="page">
      <div className="spread">
        <h1>Inženjering</h1>
        <Link href="/production" className="btn">
          Proizvodnja →
        </Link>
      </div>
      <p className="page-sub">
        Verzionisani normativi (BOM) i rutiranja — jedna puštena revizija po SKU; višenivojska
        razrada sa škartom; zahtjevi za inženjerske izmjene.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Normativi (BOM)</h2>
            {boms === null ? <LoadingState /> : null}
            {boms !== null ? (
              <DataTable
                columns={[
                  {
                    key: 'sku',
                    header: 'SKU',
                    render: (b: BomView) => <span className="mono">{skuCode(b.skuId)}</span>,
                    text: (b: BomView) => skuCode(b.skuId),
                  },
                  {
                    key: 'version',
                    header: 'Verzija',
                    render: (b: BomView) => <span className="mono">v{b.version}</span>,
                    text: (b: BomView) => `v${b.version}`,
                  },
                  {
                    key: 'lines',
                    header: 'Komponente',
                    align: 'right',
                    render: (b: BomView) => b.lines.length,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (b: BomView) => (
                      <span className={`badge ${REV_BADGE[b.status]}`}>{REV_LABELS[b.status]}</span>
                    ),
                    text: (b: BomView) => REV_LABELS[b.status],
                  },
                ]}
                rows={boms}
                rowKey={(b) => b.id}
                onRowClick={(b) => setSelectedBomId(b.id === selectedBomId ? null : b.id)}
                searchPlaceholder="Pretraga normativa…"
                pageSize={8}
                emptyText="Još nema normativa — kreirajte normativ za SKU."
              />
            ) : null}

            {selectedBom ? (
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 10,
                }}
              >
                <div className="spread">
                  <strong className="mono">
                    {skuCode(selectedBom.skuId)} · v{selectedBom.version}
                  </strong>
                  <span className={`badge ${REV_BADGE[selectedBom.status]}`}>
                    {REV_LABELS[selectedBom.status]}
                  </span>
                </div>
                {selectedBom.lines.length === 0 ? (
                  <EmptyState text="Normativ još nema komponenti." />
                ) : (
                  <table className="table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Komponenta (SKU)</th>
                        <th style={{ textAlign: 'right' }}>Količina po jedinici</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBom.lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}</td>
                          <td style={{ textAlign: 'right' }}>
                            {l.quantity}
                            {Number(l.scrapPct) > 0 ? (
                              <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                                +{l.scrapPct}% škart
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {selectedBom.status === 'DRAFT' && can('bom.manage') ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <select
                      className="select"
                      style={{ maxWidth: 140 }}
                      value={lineBom === selectedBom.id ? lineSku : ''}
                      onChange={(e) => {
                        setLineBom(selectedBom.id);
                        setLineSku(e.target.value);
                      }}
                    >
                      <option value="">Komponenta…</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min="0"
                      step="any"
                      title="Količina"
                      value={lineBom === selectedBom.id ? lineQty : '1'}
                      onChange={(e) => {
                        setLineBom(selectedBom.id);
                        setLineQty(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      title="Škart %"
                      value={lineBom === selectedBom.id ? lineScrap : '0'}
                      onChange={(e) => {
                        setLineBom(selectedBom.id);
                        setLineScrap(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      disabled={busy || lineBom !== selectedBom.id || !lineSku}
                      onClick={() =>
                        run(
                          () =>
                            api('POST', `/api/v1/boms/${selectedBom.id}/lines`, {
                              componentSkuId: lineSku,
                              quantity: Number(lineQty),
                              scrapPct: Number(lineScrap),
                            }),
                          null,
                        )
                      }
                      type="button"
                    >
                      Dodaj komponentu
                    </button>
                    {selectedBom.lines.length > 0 && can('bom.release') ? (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => setConfirmReleaseBom(selectedBom)}
                        type="button"
                      >
                        Pusti verziju
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {can('bom.manage') ? (
              <form
                className="row"
                style={{ marginTop: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/boms', { skuId: bomSku }),
                    'Nacrt normativa kreiran.',
                  );
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  value={bomSku}
                  onChange={(e) => setBomSku(e.target.value)}
                  required
                >
                  <option value="">Izlazni SKU…</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
                  Novi normativ
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Razrada normativa</h2>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                setExploded(null);
                api<{ components: ExplodedComponent[] }>(
                  'GET',
                  `/api/v1/boms/explode?skuId=${explodeSku}&quantity=${explodeQty}`,
                )
                  .then((r) => setExploded(r.components))
                  .catch((err: unknown) => setError(errorText(err)));
              }}
            >
              <select
                className="select"
                style={{ maxWidth: 160 }}
                value={explodeSku}
                onChange={(e) => setExplodeSku(e.target.value)}
                required
              >
                <option value="">SKU…</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ maxWidth: 80 }}
                type="number"
                min="1"
                step="any"
                value={explodeQty}
                onChange={(e) => setExplodeQty(e.target.value)}
              />
              <button className="btn btn-sm" type="submit">
                Razradi
              </button>
            </form>
            {exploded !== null ? (
              exploded.length === 0 ? (
                <div style={{ marginTop: 8 }}>
                  <EmptyState text="Za ovaj SKU ne postoji pušten normativ." />
                </div>
              ) : (
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {exploded.map((c, i) => (
                      <tr key={`${c.skuId}-${i}`}>
                        <td style={{ paddingLeft: c.level * 18 }}>
                          {'└ '.repeat(Math.min(c.level, 1))}
                          {c.description}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {c.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Rutiranja</h2>
            <DataTable
              columns={[
                {
                  key: 'sku',
                  header: 'SKU',
                  render: (r: RoutingView) => <span className="mono">{skuCode(r.skuId)}</span>,
                  text: (r: RoutingView) => skuCode(r.skuId),
                },
                {
                  key: 'version',
                  header: 'Verzija',
                  render: (r: RoutingView) => <span className="mono">v{r.version}</span>,
                  text: (r: RoutingView) => `v${r.version}`,
                },
                {
                  key: 'ops',
                  header: 'Operacije',
                  align: 'right',
                  render: (r: RoutingView) => r.operations.length,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r: RoutingView) => (
                    <span className={`badge ${REV_BADGE[r.status]}`}>{REV_LABELS[r.status]}</span>
                  ),
                  text: (r: RoutingView) => REV_LABELS[r.status],
                },
              ]}
              rows={routings}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedRoutingId(r.id === selectedRoutingId ? null : r.id)}
              searchPlaceholder="Pretraga rutiranja…"
              pageSize={8}
              emptyText="Još nema rutiranja — definišite operacije i vremena."
            />

            {selectedRouting ? (
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 10,
                }}
              >
                <div className="spread">
                  <strong className="mono">
                    {skuCode(selectedRouting.skuId)} · v{selectedRouting.version}
                  </strong>
                  <span className={`badge ${REV_BADGE[selectedRouting.status]}`}>
                    {REV_LABELS[selectedRouting.status]}
                  </span>
                </div>
                {selectedRouting.operations.length === 0 ? (
                  <EmptyState text="Rutiranje još nema operacija." />
                ) : (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {selectedRouting.operations.map((o) => (
                        <tr key={o.id}>
                          <td className="mono">{o.seq}</td>
                          <td>
                            {o.name} <span className="muted">@ {o.workCenter}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {o.setupMinutes}m + {o.runMinutesPerUnit}m/jed
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {selectedRouting.status === 'DRAFT' && can('bom.manage') ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      style={{ maxWidth: 120 }}
                      placeholder="Operacija"
                      value={opRouting === selectedRouting.id ? opName : ''}
                      onChange={(e) => {
                        setOpRouting(selectedRouting.id);
                        setOpName(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 110 }}
                      placeholder="Radni centar"
                      value={opRouting === selectedRouting.id ? opCenter : ''}
                      onChange={(e) => {
                        setOpRouting(selectedRouting.id);
                        setOpCenter(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min="0"
                      step="any"
                      title="Minute pripreme"
                      value={opRouting === selectedRouting.id ? opSetup : '0'}
                      onChange={(e) => {
                        setOpRouting(selectedRouting.id);
                        setOpSetup(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min="0"
                      step="any"
                      title="Minute rada po jedinici"
                      value={opRouting === selectedRouting.id ? opRun : '1'}
                      onChange={(e) => {
                        setOpRouting(selectedRouting.id);
                        setOpRun(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      disabled={busy || opRouting !== selectedRouting.id || !opName || !opCenter}
                      onClick={() =>
                        run(
                          () =>
                            api('POST', `/api/v1/routings/${selectedRouting.id}/operations`, {
                              name: opName,
                              workCenter: opCenter,
                              setupMinutes: Number(opSetup),
                              runMinutesPerUnit: Number(opRun),
                            }),
                          null,
                        ).then(() => {
                          setOpName('');
                          setOpCenter('');
                        })
                      }
                      type="button"
                    >
                      Dodaj operaciju
                    </button>
                    {selectedRouting.operations.length > 0 && can('bom.release') ? (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => setConfirmReleaseRouting(selectedRouting)}
                        type="button"
                      >
                        Pusti verziju
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {can('bom.manage') ? (
              <form
                className="row"
                style={{ marginTop: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/routings', { skuId: routingSku }),
                    'Nacrt rutiranja kreiran.',
                  );
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  value={routingSku}
                  onChange={(e) => setRoutingSku(e.target.value)}
                  required
                >
                  <option value="">SKU…</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
                  Novo rutiranje
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Inženjerske izmjene</h2>
            <DataTable
              columns={[
                {
                  key: 'ecNumber',
                  header: 'Broj',
                  render: (c: ChangeView) => <span className="mono">{c.ecNumber}</span>,
                  text: (c: ChangeView) => c.ecNumber,
                },
                {
                  key: 'title',
                  header: 'Naslov',
                  render: (c: ChangeView) => (
                    <>
                      {c.title}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {skuCode(c.targetSkuId)}
                      </div>
                    </>
                  ),
                  text: (c: ChangeView) => `${c.title} ${skuCode(c.targetSkuId)}`,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c: ChangeView) => (
                    <span className={`badge ${EC_BADGE[c.status]}`}>{EC_LABELS[c.status]}</span>
                  ),
                  text: (c: ChangeView) => EC_LABELS[c.status],
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (c: ChangeView) =>
                    c.status === 'OPEN' && can('bom.release') ? (
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/engineering-changes/${c.id}/approve`),
                              'Izmjena odobrena.',
                            )
                          }
                          type="button"
                        >
                          Odobri
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/engineering-changes/${c.id}/reject`),
                              null,
                            )
                          }
                          type="button"
                        >
                          Odbij
                        </button>
                      </span>
                    ) : null,
                },
              ]}
              rows={changes}
              rowKey={(c) => c.id}
              searchPlaceholder="Pretraga izmjena…"
              pageSize={8}
              emptyText="Nema zahtjeva za izmjene."
            />
            {can('bom.manage') ? (
              <form
                className="row"
                style={{ marginTop: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/engineering-changes', {
                        targetSkuId: ecSku,
                        title: ecTitle,
                      }),
                    'Zahtjev za izmjenu otvoren.',
                  ).then(() => setEcTitle(''));
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 140 }}
                  value={ecSku}
                  onChange={(e) => setEcSku(e.target.value)}
                  required
                >
                  <option value="">SKU…</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ maxWidth: 220 }}
                  placeholder="Šta treba izmijeniti?"
                  value={ecTitle}
                  onChange={(e) => setEcTitle(e.target.value)}
                  required
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Zahtijevaj izmjenu
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {confirmReleaseBom ? (
        <ConfirmDialog
          open
          title={`Puštanje normativa ${skuCode(confirmReleaseBom.skuId)} v${confirmReleaseBom.version}`}
          consequence="Puštena verzija normativa/rutiranja postaje važeća za nove radne naloge."
          confirmLabel="Pusti verziju"
          busy={busy}
          onConfirm={() => {
            const b = confirmReleaseBom;
            void run(
              () => api('POST', `/api/v1/boms/${b.id}/release`),
              'Normativ pušten — prethodna revizija označena kao zastarjela.',
            ).then(() => setConfirmReleaseBom(null));
          }}
          onCancel={() => setConfirmReleaseBom(null)}
        >
          <div className="fact">
            <span>SKU</span>
            <span className="mono">{skuCode(confirmReleaseBom.skuId)}</span>
          </div>
          <div className="fact">
            <span>Verzija</span>
            <span className="mono">v{confirmReleaseBom.version}</span>
          </div>
          <div className="fact">
            <span>Broj komponenti</span>
            <span>{confirmReleaseBom.lines.length}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirmReleaseRouting ? (
        <ConfirmDialog
          open
          title={`Puštanje rutiranja ${skuCode(confirmReleaseRouting.skuId)} v${confirmReleaseRouting.version}`}
          consequence="Puštena verzija normativa/rutiranja postaje važeća za nove radne naloge."
          confirmLabel="Pusti verziju"
          busy={busy}
          onConfirm={() => {
            const r = confirmReleaseRouting;
            void run(
              () => api('POST', `/api/v1/routings/${r.id}/release`),
              'Rutiranje pušteno.',
            ).then(() => setConfirmReleaseRouting(null));
          }}
          onCancel={() => setConfirmReleaseRouting(null)}
        >
          <div className="fact">
            <span>SKU</span>
            <span className="mono">{skuCode(confirmReleaseRouting.skuId)}</span>
          </div>
          <div className="fact">
            <span>Verzija</span>
            <span className="mono">v{confirmReleaseRouting.version}</span>
          </div>
          <div className="fact">
            <span>Broj operacija</span>
            <span>{confirmReleaseRouting.operations.length}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
