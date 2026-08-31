'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
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

const REV_BADGE: Record<BomView['status'], string> = {
  DRAFT: 'badge-warn',
  RELEASED: 'badge-ok',
  OBSOLETE: '',
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

  return (
    <main className="page">
      <h1>Engineering</h1>
      <p className="page-sub">
        Versioned bills of materials and routings — one released revision per SKU; multi-level
        explosion with scrap; engineering change requests.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Bills of materials</h2>
            {boms === null ? <div className="loading">Loading…</div> : null}
            {boms && boms.length === 0 ? (
              <div className="empty">No BOMs yet — create one for a SKU.</div>
            ) : null}
            {(boms ?? []).map((b) => (
              <div
                key={b.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div className="spread">
                  <strong className="mono">
                    {skuCode(b.skuId)} · v{b.version}
                  </strong>
                  <span className={`badge ${REV_BADGE[b.status]}`}>{b.status}</span>
                </div>
                {b.lines.length > 0 ? (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {b.lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}</td>
                          <td style={{ textAlign: 'right' }}>
                            {l.quantity}
                            {Number(l.scrapPct) > 0 ? (
                              <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                                +{l.scrapPct}% scrap
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {b.status === 'DRAFT' && can('bom.manage') ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <select
                      className="select"
                      style={{ maxWidth: 140 }}
                      value={lineBom === b.id ? lineSku : ''}
                      onChange={(e) => {
                        setLineBom(b.id);
                        setLineSku(e.target.value);
                      }}
                    >
                      <option value="">Component…</option>
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
                      title="Quantity"
                      value={lineBom === b.id ? lineQty : '1'}
                      onChange={(e) => {
                        setLineBom(b.id);
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
                      title="Scrap %"
                      value={lineBom === b.id ? lineScrap : '0'}
                      onChange={(e) => {
                        setLineBom(b.id);
                        setLineScrap(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      disabled={busy || lineBom !== b.id || !lineSku}
                      onClick={() =>
                        run(
                          () =>
                            api('POST', `/api/v1/boms/${b.id}/lines`, {
                              componentSkuId: lineSku,
                              quantity: Number(lineQty),
                              scrapPct: Number(lineScrap),
                            }),
                          null,
                        )
                      }
                      type="button"
                    >
                      Add component
                    </button>
                    {b.lines.length > 0 && can('bom.release') ? (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/boms/${b.id}/release`),
                            'BOM released — previous revision obsoleted.',
                          )
                        }
                        type="button"
                      >
                        Release
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {can('bom.manage') ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/boms', { skuId: bomSku }),
                    'Draft BOM created.',
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
                  <option value="">Output SKU…</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
                  New BOM
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>BOM explosion</h2>
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
                Explode
              </button>
            </form>
            {exploded !== null ? (
              exploded.length === 0 ? (
                <div className="empty" style={{ marginTop: 8 }}>
                  No released BOM for this SKU.
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
            <h2>Routings</h2>
            {routings.length === 0 ? (
              <div className="empty">No routings yet — define operations and times.</div>
            ) : null}
            {routings.map((r) => (
              <div
                key={r.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div className="spread">
                  <strong className="mono">
                    {skuCode(r.skuId)} · v{r.version}
                  </strong>
                  <span className={`badge ${REV_BADGE[r.status]}`}>{r.status}</span>
                </div>
                {r.operations.length > 0 ? (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {r.operations.map((o) => (
                        <tr key={o.id}>
                          <td className="mono">{o.seq}</td>
                          <td>
                            {o.name} <span className="muted">@ {o.workCenter}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {o.setupMinutes}m + {o.runMinutesPerUnit}m/u
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {r.status === 'DRAFT' && can('bom.manage') ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      style={{ maxWidth: 120 }}
                      placeholder="Operation"
                      value={opRouting === r.id ? opName : ''}
                      onChange={(e) => {
                        setOpRouting(r.id);
                        setOpName(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 110 }}
                      placeholder="Work center"
                      value={opRouting === r.id ? opCenter : ''}
                      onChange={(e) => {
                        setOpRouting(r.id);
                        setOpCenter(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min="0"
                      step="any"
                      title="Setup minutes"
                      value={opRouting === r.id ? opSetup : '0'}
                      onChange={(e) => {
                        setOpRouting(r.id);
                        setOpSetup(e.target.value);
                      }}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min="0"
                      step="any"
                      title="Run minutes per unit"
                      value={opRouting === r.id ? opRun : '1'}
                      onChange={(e) => {
                        setOpRouting(r.id);
                        setOpRun(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      disabled={busy || opRouting !== r.id || !opName || !opCenter}
                      onClick={() =>
                        run(
                          () =>
                            api('POST', `/api/v1/routings/${r.id}/operations`, {
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
                      Add op
                    </button>
                    {r.operations.length > 0 && can('bom.release') ? (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/routings/${r.id}/release`),
                            'Routing released.',
                          )
                        }
                        type="button"
                      >
                        Release
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {can('bom.manage') ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/routings', { skuId: routingSku }),
                    'Draft routing created.',
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
                  New routing
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Engineering changes</h2>
            {changes.length === 0 ? <div className="empty">No change requests.</div> : null}
            {changes.length > 0 ? (
              <table className="table">
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.ecNumber}</td>
                      <td>
                        {c.title}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {skuCode(c.targetSkuId)}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${EC_BADGE[c.status]}`}>{c.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {c.status === 'OPEN' && can('bom.release') ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/engineering-changes/${c.id}/approve`),
                                  'Change approved.',
                                )
                              }
                              type="button"
                            >
                              Approve
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
                              Reject
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
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
                    'Change request opened.',
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
                  placeholder="What should change?"
                  value={ecTitle}
                  onChange={(e) => setEcTitle(e.target.value)}
                  required
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Request change
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
