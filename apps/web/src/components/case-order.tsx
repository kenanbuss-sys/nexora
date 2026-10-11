'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../lib/api';
import { formatPromiseDate } from './delivery-promise';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from './ui';

/**
 * CSM-011 (Sprint 245): case-to-order linkage. A support case points at one
 * sales order, names the affected order lines and can open a return (RMA)
 * for them. The server validates every rule (same customer, quantities,
 * issue types, returnable types, closed case); this file only collects
 * input, explains blocked actions and displays what the server returns.
 */

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  DAMAGED: 'Oštećeno',
  WRONG_ITEM: 'Pogrešan artikal',
  MISSING: 'Nedostaje',
  LATE: 'Kašnjenje',
  QUALITY: 'Kvalitet',
  OTHER: 'Ostalo',
};

/** Configured issue codes without a known label are shown as received. */
export function issueTypeLabel(code: string): string {
  return ISSUE_TYPE_LABELS[code] ?? code;
}

const CASE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Otvoren',
  IN_PROGRESS: 'U toku',
  RESOLVED: 'Riješen',
  CLOSED: 'Zatvoren',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđena',
  ON_HOLD: 'Na čekanju',
  FULFILLED: 'Ispunjena',
  CANCELLED: 'Otkazana',
};

const RETURN_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Zatražen',
  APPROVED: 'Odobren',
  REJECTED: 'Odbijen',
  RECEIVED: 'Zaprimljen',
  CLOSED: 'Zatvoren',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Nizak',
  NORMAL: 'Normalan',
  HIGH: 'Visok',
  URGENT: 'Hitan',
};

function caseBadge(status: string): string {
  if (status === 'CLOSED') return '';
  if (status === 'RESOLVED') return 'badge-ok';
  return 'badge-warn';
}

interface CaseOrderLine {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  fulfilledQty: string;
  backordered: boolean;
  promisedAt: string | null;
}

interface CaseOrderItem {
  orderLineId: string;
  quantity: string;
  issueType: string;
  note: string | null;
}

interface CaseOrderContext {
  caseId: string;
  order: {
    id: string;
    orderNumber: string;
    accountId: string;
    status: string;
    currency: string;
    total: string;
    fulfillmentType: string;
    createdAt: string;
    promisedAt: string | null;
    lines: CaseOrderLine[];
    timeline: Array<{ eventType: string; note: string | null; createdAt: string }>;
  } | null;
  items: CaseOrderItem[];
  returns: Array<{
    id: string;
    rmaNumber: string;
    status: string;
    reason: string;
    createdAt: string;
    lines: Array<{ orderLineId: string; quantity: string; description?: string }>;
  }>;
  caseReturns: Array<{ returnId: string; rmaNumber: string; createdAt: string }>;
  issueTypes: string[];
  returnableIssueTypes: string[];
  otherCases: Array<{ id: string; caseNumber: string; subject: string; status: string }>;
}

interface OrderOption {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  total: string;
}

interface DraftItem {
  checked: boolean;
  quantity: string;
  issueType: string;
  note: string;
}

function newRequestKey(caseId: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `case-rma-${crypto.randomUUID()}`;
  }
  return `case-rma-${caseId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function draftFrom(ctx: CaseOrderContext): Record<string, DraftItem> {
  const draft: Record<string, DraftItem> = {};
  const fallbackType = ctx.issueTypes[0] ?? 'OTHER';
  for (const line of ctx.order?.lines ?? []) {
    const saved = ctx.items.find((i) => i.orderLineId === line.id);
    draft[line.id] = saved
      ? {
          checked: true,
          quantity: saved.quantity,
          issueType: saved.issueType,
          note: saved.note ?? '',
        }
      : { checked: false, quantity: line.quantity, issueType: fallbackType, note: '' };
  }
  return draft;
}

function sameAsSaved(ctx: CaseOrderContext, draft: Record<string, DraftItem>): boolean {
  const checked = Object.entries(draft).filter(([, d]) => d.checked);
  if (checked.length !== ctx.items.length) return false;
  return checked.every(([lineId, d]) => {
    const saved = ctx.items.find((i) => i.orderLineId === lineId);
    return (
      !!saved &&
      Number(saved.quantity) === Number(d.quantity) &&
      saved.issueType === d.issueType &&
      (saved.note ?? '') === d.note.trim()
    );
  });
}

export interface CaseOrderPanelProps {
  caseId: string;
  caseNumber: string;
  caseStatus: string;
  /** The case's customer account, when known — narrows the order picker. */
  accountId: string | null;
  canManage: boolean;
  canReturn: boolean;
  canReadOrders: boolean;
  /** Called after the server accepted a change (link, items, return). */
  onChanged?: () => void;
  /** Opens another case in place (same page). */
  onOpenCase?: (caseId: string) => void;
}

/** Case detail: "Narudžba", "Pogođene stavke" and returns opened from the case. */
export function CaseOrderPanel({
  caseId,
  caseNumber,
  caseStatus,
  accountId,
  canManage,
  canReturn,
  canReadOrders,
  onChanged,
  onOpenCase,
}: CaseOrderPanelProps) {
  const [ctx, setCtx] = useState<CaseOrderContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, DraftItem>>({});

  const [orders, setOrders] = useState<OrderOption[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderQuery, setOrderQuery] = useState('');
  const [pickedOrder, setPickedOrder] = useState('');

  const [rmaOpen, setRmaOpen] = useState(false);
  const [rmaKey, setRmaKey] = useState('');
  const [rmaReason, setRmaReason] = useState('');

  const load = useCallback(() => {
    setLoadError(null);
    api<CaseOrderContext>('GET', `/api/v1/support-cases/${caseId}/order-context`)
      .then((r) => {
        setCtx(r);
        setDraft(draftFrom(r));
      })
      .catch((e: unknown) => setLoadError(errorText(e)));
  }, [caseId]);

  useEffect(() => {
    setCtx(null);
    setError(null);
    setNotice(null);
    load();
  }, [load]);

  const needsPicker = ctx !== null && ctx.order === null && canManage && canReadOrders;
  useEffect(() => {
    if (!needsPicker) return;
    setOrders(null);
    setOrdersError(null);
    const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    api<{ orders: OrderOption[] }>('GET', `/api/v1/orders${query}`)
      .then((r) => setOrders(r.orders))
      .catch((e: unknown) => setOrdersError(errorText(e)));
  }, [needsPicker, accountId]);

  async function run(fn: () => Promise<string | null>): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const text = await fn();
      if (text) setNotice(text);
      load();
      onChanged?.();
      return true;
    } catch (e: unknown) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const order = ctx?.order ?? null;
  const lineById = useMemo(
    () => new Map((order?.lines ?? []).map((l) => [l.id, l] as const)),
    [order],
  );
  const lineText = (lineId: string, fallback?: string) =>
    lineById.get(lineId)?.description ?? fallback ?? lineId.slice(0, 8);

  const filteredOrders = (orders ?? []).filter((o) =>
    o.orderNumber.toLowerCase().includes(orderQuery.trim().toLowerCase()),
  );

  // Client-side hints only; the server re-validates every line on save.
  const draftProblems = ctx
    ? Object.entries(draft)
        .filter(([, d]) => d.checked)
        .map(([lineId, d]) => {
          const line = lineById.get(lineId);
          const qty = Number(d.quantity);
          if (!line) return null;
          if (!(qty > 0)) return `${line.description}: količina mora biti veća od 0.`;
          if (qty > Number(line.quantity)) {
            return `${line.description}: količina ne smije biti veća od naručene (${line.quantity}).`;
          }
          if (d.note.trim().length > 500) return `${line.description}: napomena je preduga.`;
          return null;
        })
        .filter((p): p is string => p !== null)
    : [];
  const dirty = ctx ? !sameAsSaved(ctx, draft) : false;

  const returnableItems = ctx
    ? ctx.items.filter((i) => ctx.returnableIssueTypes.includes(i.issueType))
    : [];
  const returnableLabels = (ctx?.returnableIssueTypes ?? []).map(issueTypeLabel).join(', ');
  let rmaBlocked: string | null = null;
  if (caseStatus === 'CLOSED') rmaBlocked = 'Zatvoren slučaj ne može otvoriti povrat.';
  else if (dirty) rmaBlocked = 'Prvo sačuvajte izmjene pogođenih stavki.';
  else if (returnableItems.length === 0) {
    rmaBlocked = returnableLabels
      ? `Povrat je moguć samo za stavke s vrstom problema: ${returnableLabels}.`
      : 'Konfiguracija ne predviđa vrste problema za koje se roba vraća.';
  }

  if (loadError) return <ErrorState text={loadError} />;
  if (!ctx) return <LoadingState text="Učitavanje narudžbe slučaja…" />;

  return (
    <div>
      {error ? <ErrorState text={error} /> : null}
      {notice ? (
        <div className="alert alert-ok" role="status">
          {notice}
        </div>
      ) : null}

      <h3 style={{ marginTop: 8 }}>Narudžba</h3>
      {order === null ? (
        <>
          <EmptyState text="Slučaj nije povezan s narudžbom." />
          {!canManage ? null : !canReadOrders ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Za povezivanje je potrebno pravo pregleda narudžbi.
            </p>
          ) : caseStatus === 'CLOSED' ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Zatvoren slučaj se ne može povezati s narudžbom.
            </p>
          ) : (
            <form
              className="row"
              style={{ flexWrap: 'wrap', marginTop: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!pickedOrder) return;
                void run(async () => {
                  await api('POST', `/api/v1/support-cases/${caseId}/order`, {
                    orderId: pickedOrder,
                  });
                  setPickedOrder('');
                  return 'Slučaj je povezan s narudžbom.';
                });
              }}
            >
              {ordersError ? <ErrorState text={ordersError} /> : null}
              {orders === null && !ordersError ? (
                <LoadingState text="Učitavanje narudžbi…" />
              ) : null}
              {orders !== null ? (
                <>
                  <input
                    className="input"
                    style={{ maxWidth: 180 }}
                    placeholder="Broj narudžbe…"
                    aria-label="Pretraga narudžbi po broju"
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                  />
                  <select
                    className="select"
                    style={{ maxWidth: 320 }}
                    aria-label="Narudžba za povezivanje"
                    value={pickedOrder}
                    onChange={(e) => setPickedOrder(e.target.value)}
                    required
                  >
                    <option value="">
                      {filteredOrders.length === 0
                        ? accountId
                          ? 'Kupac nema narudžbi'
                          : 'Nema narudžbi'
                        : 'Odaberite narudžbu…'}
                    </option>
                    {filteredOrders.slice(0, 200).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} — {ORDER_STATUS_LABELS[o.status] ?? o.status} — {o.total}{' '}
                        {o.currency}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm btn-primary"
                    type="submit"
                    disabled={busy || !pickedOrder}
                  >
                    Poveži
                  </button>
                  {!accountId ? (
                    <span className="muted" style={{ fontSize: 12 }}>
                      Slučaj nema kupca — prikazane su sve narudžbe; server odbija narudžbu drugog
                      kupca.
                    </span>
                  ) : null}
                </>
              ) : null}
            </form>
          )}
        </>
      ) : (
        <>
          <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong className="mono">{order.orderNumber}</strong>{' '}
              <span className="badge badge-accent">
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>
            {canReadOrders ? (
              <Link className="btn btn-sm" href={`/orders?order=${order.id}`}>
                Otvori narudžbu →
              </Link>
            ) : null}
          </div>
          <div className="grid-4" style={{ margin: '8px 0' }}>
            <div className="fact">
              <span>Datum</span>
              <span>{formatPromiseDate(order.createdAt)}</span>
            </div>
            <div className="fact">
              <span>Obećana isporuka</span>
              <span>{formatPromiseDate(order.promisedAt)}</span>
            </div>
            <div className="fact">
              <span>Ukupno</span>
              <span className="mono">
                {order.total} {order.currency}
              </span>
            </div>
          </div>

          <table className="table" aria-label="Stavke narudžbe">
            <thead>
              <tr>
                <th>Stavka</th>
                <th style={{ textAlign: 'right' }}>Naručeno</th>
                <th style={{ textAlign: 'right' }}>Isporučeno</th>
                <th>Obećano</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.description}
                    {l.backordered ? (
                      <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                        zaostatak
                      </span>
                    ) : null}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {l.quantity}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {l.fulfilledQty}
                  </td>
                  <td>{formatPromiseDate(l.promisedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.lines.length === 0 ? <EmptyState text="Narudžba nema stavki." /> : null}

          <div className="grid-2" style={{ marginTop: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Posljednji događaji
              </div>
              {order.timeline.length === 0 ? (
                <EmptyState text="Nema događaja u historiji." />
              ) : (
                [...order.timeline]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 8)
                  .map((ev, i) => (
                    <div
                      key={`${ev.createdAt}-${i}`}
                      className="muted"
                      style={{ fontSize: 12, padding: '2px 0' }}
                    >
                      <span className="mono">{new Date(ev.createdAt).toLocaleString()}</span> —{' '}
                      {ev.eventType}
                      {ev.note ? ` (${ev.note})` : ''}
                    </div>
                  ))
              )}
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Povrati narudžbe
              </div>
              {ctx.returns.length === 0 ? (
                <EmptyState text="Narudžba nema povrata." />
              ) : (
                ctx.returns.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, padding: '2px 0' }}>
                    <strong className="mono">{r.rmaNumber}</strong>{' '}
                    <span className="badge">{RETURN_STATUS_LABELS[r.status] ?? r.status}</span>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {formatPromiseDate(r.createdAt)} · {r.reason}
                    </span>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.lines
                        .map((l) => `${lineText(l.orderLineId, l.description)} × ${l.quantity}`)
                        .join(', ')}
                    </div>
                  </div>
                ))
              )}
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>
                Drugi slučajevi za ovu narudžbu
              </div>
              {ctx.otherCases.length === 0 ? (
                <EmptyState text="Nema drugih slučajeva." />
              ) : (
                ctx.otherCases.map((c) => (
                  <div key={c.id} style={{ fontSize: 13, padding: '2px 0' }}>
                    {onOpenCase ? (
                      <button className="btn btn-sm" type="button" onClick={() => onOpenCase(c.id)}>
                        {c.caseNumber}
                      </button>
                    ) : (
                      <Link className="mono" href={`/crm?case=${c.id}`}>
                        {c.caseNumber}
                      </Link>
                    )}{' '}
                    {c.subject}{' '}
                    <span className={`badge ${caseBadge(c.status)}`}>
                      {CASE_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <h3 style={{ marginTop: 14 }}>Pogođene stavke</h3>
          {canManage && caseStatus !== 'CLOSED' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draftProblems.length > 0) return;
                const items = Object.entries(draft)
                  .filter(([, d]) => d.checked)
                  .map(([orderLineId, d]) => ({
                    orderLineId,
                    quantity: Number(d.quantity),
                    issueType: d.issueType,
                    ...(d.note.trim() ? { note: d.note.trim() } : {}),
                  }));
                void run(async () => {
                  await api('PUT', `/api/v1/support-cases/${caseId}/order-items`, { items });
                  return items.length === 0
                    ? 'Pogođene stavke su uklonjene.'
                    : 'Pogođene stavke su sačuvane.';
                });
              }}
            >
              <table className="table" aria-label="Pogođene stavke">
                <thead>
                  <tr>
                    <th>Pogođena</th>
                    <th style={{ textAlign: 'right' }}>Količina</th>
                    <th>Vrsta problema</th>
                    <th>Napomena</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => {
                    const d = draft[l.id];
                    if (!d) return null;
                    const set = (patch: Partial<DraftItem>) =>
                      setDraft((prev) => ({ ...prev, [l.id]: { ...d, ...patch } }));
                    const types = ctx.issueTypes.includes(d.issueType)
                      ? ctx.issueTypes
                      : [...ctx.issueTypes, d.issueType];
                    return (
                      <tr key={l.id}>
                        <td>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={d.checked}
                              onChange={(e) => set({ checked: e.target.checked })}
                            />
                            {l.description}
                          </label>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            className="input mono"
                            style={{ maxWidth: 90 }}
                            type="number"
                            min={0}
                            max={Number(l.quantity)}
                            step="any"
                            aria-label={`Pogođena količina — ${l.description} (naručeno ${l.quantity})`}
                            disabled={!d.checked}
                            value={d.quantity}
                            onChange={(e) => set({ quantity: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="select"
                            style={{ maxWidth: 170 }}
                            aria-label={`Vrsta problema — ${l.description}`}
                            disabled={!d.checked}
                            value={d.issueType}
                            onChange={(e) => set({ issueType: e.target.value })}
                          >
                            {types.map((t) => (
                              <option key={t} value={t}>
                                {issueTypeLabel(t)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input"
                            maxLength={500}
                            aria-label={`Napomena — ${l.description}`}
                            disabled={!d.checked}
                            value={d.note}
                            onChange={(e) => set({ note: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {draftProblems.map((p) => (
                <div key={p} className="alert alert-error" role="alert">
                  {p}
                </div>
              ))}
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-sm btn-primary"
                  type="submit"
                  disabled={busy || !dirty || draftProblems.length > 0}
                >
                  Sačuvaj stavke
                </button>
                {dirty ? (
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft(draftFrom(ctx))}
                  >
                    Poništi izmjene
                  </button>
                ) : null}
              </div>
            </form>
          ) : ctx.items.length === 0 ? (
            <EmptyState text="Nema označenih pogođenih stavki." />
          ) : (
            <table className="table" aria-label="Pogođene stavke">
              <thead>
                <tr>
                  <th>Stavka</th>
                  <th style={{ textAlign: 'right' }}>Količina</th>
                  <th>Vrsta problema</th>
                  <th>Napomena</th>
                </tr>
              </thead>
              <tbody>
                {ctx.items.map((i) => (
                  <tr key={i.orderLineId}>
                    <td>{lineText(i.orderLineId)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {i.quantity}
                    </td>
                    <td>{issueTypeLabel(i.issueType)}</td>
                    <td>{i.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ marginTop: 14 }}>Povrati iz slučaja</h3>
          {canReturn ? (
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 6 }}>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                disabled={busy || rmaBlocked !== null}
                aria-describedby={rmaBlocked ? `rma-blocked-${caseId}` : undefined}
                onClick={() => {
                  setRmaKey(newRequestKey(caseId));
                  setRmaReason('');
                  setRmaOpen(true);
                }}
              >
                Otvori povrat (RMA)
              </button>
              {rmaBlocked ? (
                <span id={`rma-blocked-${caseId}`} className="muted" style={{ fontSize: 12 }}>
                  {rmaBlocked}
                </span>
              ) : null}
            </div>
          ) : null}
          {ctx.caseReturns.length === 0 ? (
            <EmptyState text="Iz ovog slučaja još nije otvoren povrat." />
          ) : (
            ctx.caseReturns.map((r) => {
              const full = ctx.returns.find((x) => x.id === r.returnId);
              return (
                <div key={r.returnId} style={{ fontSize: 13, padding: '2px 0' }}>
                  <strong className="mono">{r.rmaNumber}</strong>{' '}
                  {full ? (
                    <span className="badge">
                      {RETURN_STATUS_LABELS[full.status] ?? full.status}
                    </span>
                  ) : null}{' '}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatPromiseDate(r.createdAt)}
                  </span>
                </div>
              );
            })
          )}
        </>
      )}

      {rmaOpen && order ? (
        <ConfirmDialog
          open
          title="Otvaranje povrata (RMA)"
          consequence="Za narudžbu se otvara zahtjev za povrat robe sa sljedećim stavkama. Stavke s vrstom problema bez povrata se ne uključuju."
          confirmLabel="Otvori povrat"
          busy={busy}
          onCancel={() => setRmaOpen(false)}
          onConfirm={() => {
            const requestKey = rmaKey;
            const reason = rmaReason.trim();
            void run(async () => {
              const r = await api<{ rmaNumber: string; duplicate: boolean }>(
                'POST',
                `/api/v1/support-cases/${caseId}/returns`,
                { requestKey, ...(reason ? { reason } : {}) },
              );
              return r.duplicate
                ? `Povrat ${r.rmaNumber} je već otvoren za ovaj zahtjev.`
                : `Povrat ${r.rmaNumber} je otvoren.`;
            }).then((ok) => {
              if (ok) setRmaOpen(false);
            });
          }}
        >
          <div className="fact">
            <span>Slučaj</span>
            <span className="mono">{caseNumber}</span>
          </div>
          <div className="fact">
            <span>Narudžba</span>
            <span className="mono">{order.orderNumber}</span>
          </div>
          {returnableItems.map((i) => (
            <div key={i.orderLineId} className="fact">
              <span>
                {lineText(i.orderLineId)} ({issueTypeLabel(i.issueType)})
              </span>
              <span className="mono">{i.quantity}</span>
            </div>
          ))}
          <label className="label" htmlFor={`rma-reason-${caseId}`}>
            Razlog (opcionalno)
          </label>
          <input
            id={`rma-reason-${caseId}`}
            className="input"
            maxLength={500}
            placeholder={`Slučaj ${caseNumber}`}
            value={rmaReason}
            onChange={(e) => setRmaReason(e.target.value)}
          />
          {error ? <ErrorState text={error} /> : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

interface OrderCaseView {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  items: Array<{ orderLineId: string; quantity: string; issueType: string }>;
}

/** Order detail: "Reklamacije" — support cases that point at this order. */
export function OrderCasesSection({
  orderId,
  lines,
}: {
  orderId: string;
  lines: Array<{ id: string; description: string }>;
}) {
  const [cases, setCases] = useState<OrderCaseView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCases(null);
    setError(null);
    api<{ cases: OrderCaseView[] }>('GET', `/api/v1/support-cases/by-order/${orderId}`)
      .then((r) => setCases(r.cases))
      .catch((e: unknown) => setError(errorText(e)));
  }, [orderId]);

  const lineText = (id: string) => lines.find((l) => l.id === id)?.description ?? id.slice(0, 8);

  return (
    <section style={{ marginTop: 12 }} aria-label="Reklamacije">
      <h3>Reklamacije</h3>
      {error ? <ErrorState text={error} /> : null}
      {!error && cases === null ? <LoadingState text="Učitavanje reklamacija…" /> : null}
      {cases !== null && cases.length === 0 ? (
        <EmptyState text="Nema reklamacija za ovu narudžbu." />
      ) : null}
      {(cases ?? []).map((c) => (
        <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
          <div className="spread" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span>
              <Link className="mono" href={`/crm?case=${c.id}`}>
                <strong>{c.caseNumber}</strong>
              </Link>{' '}
              {c.subject}{' '}
              <span className={`badge ${caseBadge(c.status)}`}>
                {CASE_STATUS_LABELS[c.status] ?? c.status}
              </span>{' '}
              <span className="badge">{PRIORITY_LABELS[c.priority] ?? c.priority}</span>
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {formatPromiseDate(c.createdAt)}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {c.items.length === 0
              ? 'Pogođene stavke nisu označene.'
              : c.items
                  .map(
                    (i) =>
                      `${lineText(i.orderLineId)} × ${i.quantity} (${issueTypeLabel(i.issueType)})`,
                  )
                  .join(', ')}
          </div>
        </div>
      ))}
    </section>
  );
}
