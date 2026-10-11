'use client';

import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiRequestError, errorText } from '../lib/api';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from './ui';

/**
 * PLAN-015 (Sprint 244): delivery-promise presentation. The server computes
 * every date, quantity and source; this file only formats and displays them.
 */

export type PromiseSourceKind =
  'STOCK' | 'RESERVED' | 'PURCHASE_ORDER' | 'WORK_ORDER' | 'PRODUCTION_CAPACITY' | 'LEAD_TIME';

export interface PromiseSourceView {
  kind: PromiseSourceKind;
  reference: string | null;
  quantity: number;
  at: string;
}

/** Fields shared by order-promise lines and planning-check lines. */
export interface PromiseLineCore {
  quantity: number;
  availableNow: number;
  promisedAt: string;
  days: number;
  source: PromiseSourceKind;
  sources: PromiseSourceView[];
  leadTimeDays: number;
  explanation: string;
}

export const PROMISE_SOURCE_LABELS: Record<PromiseSourceKind, string> = {
  STOCK: 'Sa zalihe',
  RESERVED: 'Rezervisano',
  PURCHASE_ORDER: 'Narudžba dobavljaču',
  WORK_ORDER: 'Radni nalog',
  PRODUCTION_CAPACITY: 'Kapacitet proizvodnje',
  LEAD_TIME: 'Rok nabavke',
};

const SOURCE_BADGE: Record<PromiseSourceKind, string> = {
  STOCK: 'badge-ok',
  RESERVED: 'badge-ok',
  PURCHASE_ORDER: 'badge-info',
  WORK_ORDER: 'badge-accent',
  PRODUCTION_CAPACITY: 'badge-accent',
  LEAD_TIME: 'badge-warn',
};

/** Local calendar date as dd.mm.yyyy. */
export function formatPromiseDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function daysLabel(n: number): string {
  if (n === 0) return 'danas';
  const lastTwo = n % 100;
  const last = n % 10;
  const word = last === 1 && lastTwo !== 11 ? 'radni dan' : 'radnih dana';
  return `${n} ${word}`;
}

/**
 * The engine explains in English; known phrasings are rendered in Bosnian,
 * anything else is shown as received (the original stays in the tooltip).
 */
export function translateExplanation(text: string): string {
  if (text === 'Covered by promisable stock') return 'Pokriveno raspoloživom zalihom';
  if (text === 'Already reserved — ships after handling') {
    return 'Već rezervisano — isporuka nakon obrade';
  }
  let m = /^Covered by (.+)$/.exec(text);
  if (m) {
    const parts = m[1]!.split(', ').map((p) => {
      const [kind, ...rest] = p.split(' ');
      const label = PROMISE_SOURCE_LABELS[kind as PromiseSourceKind];
      return label ? [label, ...rest].join(' ') : p;
    });
    return `Pokriveno: ${parts.join(', ')}`;
  }
  m = /^Short ([^:]+): production fits after (\d+) working day\(s\) (.*)$/.exec(text);
  if (m) return `Nedostaje ${m[1]}: proizvodnja moguća nakon ${daysLabel(Number(m[2]))} ${m[3]}`;
  m = /^Short ([^:]+): replenished within the (\d+)-day planning lead time$/.exec(text);
  if (m) return `Nedostaje ${m[1]}: dopuna unutar planskog roka nabavke od ${m[2]} dana`;
  m = /^Short ([^:]+): no lead time policy — default (\d+) day\(s\)$/.exec(text);
  if (m) return `Nedostaje ${m[1]}: nema politike roka nabavke — zadano ${m[2]} dana`;
  return text;
}

function sameDate(a: string, b: string): boolean {
  return formatPromiseDate(a) === formatPromiseDate(b);
}

interface PromiseLinesTableProps<T extends PromiseLineCore> {
  lines: T[];
  rowKey: (line: T) => string;
  label: (line: T) => ReactNode;
  /** Extra per-line content under the promised date (e.g. committed promise). */
  extra?: (line: T) => ReactNode;
}

/** Per-line promise table with expandable supply sources. */
export function PromiseLinesTable<T extends PromiseLineCore>({
  lines,
  rowKey,
  label,
  extra,
}: PromiseLinesTableProps<T>) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Stavka</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              Količina
            </th>
            <th scope="col" style={{ textAlign: 'right' }}>
              Odmah
            </th>
            <th scope="col">Rok</th>
            <th scope="col">Izvor</th>
            <th scope="col" aria-label="Detalji" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const key = rowKey(l);
            const expanded = !!open[key];
            const partial = l.availableNow > 0 && l.availableNow < l.quantity;
            return (
              <Fragment key={key}>
                <tr>
                  <td>
                    {label(l)}
                    <div className="muted" style={{ fontSize: 12 }} title={l.explanation}>
                      {translateExplanation(l.explanation)}
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {l.quantity}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {l.availableNow}
                    {partial ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        odmah {l.availableNow} od {l.quantity}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className="mono">{formatPromiseDate(l.promisedAt)}</span>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {daysLabel(l.days)}
                      {l.leadTimeDays > 0 ? ` · rok nabavke ${l.leadTimeDays} d` : ''}
                    </div>
                    {extra ? extra(l) : null}
                  </td>
                  <td>
                    <span className={`badge ${SOURCE_BADGE[l.source] ?? 'badge-info'}`}>
                      {PROMISE_SOURCE_LABELS[l.source] ?? l.source}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {l.sources.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-expanded={expanded}
                        aria-controls={`promise-src-${key}`}
                        onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                      >
                        {expanded ? 'Sakrij izvore' : `Izvori (${l.sources.length})`}
                      </button>
                    ) : null}
                  </td>
                </tr>
                {expanded ? (
                  <tr id={`promise-src-${key}`}>
                    <td colSpan={6}>
                      <table className="table" aria-label="Izvori snabdijevanja">
                        <thead>
                          <tr>
                            <th scope="col">Izvor</th>
                            <th scope="col">Referenca</th>
                            <th scope="col" style={{ textAlign: 'right' }}>
                              Količina
                            </th>
                            <th scope="col">Datum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {l.sources.map((s, i) => (
                            <tr key={`${s.kind}-${s.reference ?? ''}-${i}`}>
                              <td>{PROMISE_SOURCE_LABELS[s.kind] ?? s.kind}</td>
                              <td className="mono">{s.reference ?? '—'}</td>
                              <td className="mono" style={{ textAlign: 'right' }}>
                                {s.quantity}
                              </td>
                              <td className="mono">{formatPromiseDate(s.at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface OrderPromiseLine extends PromiseLineCore {
  lineId: string;
  skuId: string;
  description: string;
  fromStock: boolean;
  committedPromise: string | null;
}

interface OrderPromiseView {
  orderPromise: string;
  lines: OrderPromiseLine[];
}

interface OrderPromiseCardProps {
  orderId: string;
  status: string;
  /** order.confirm — the commit action is not rendered without it. */
  canCommit: boolean;
  onCommitted?: (promisedAt: string) => void;
}

const CLOSED_STATUSES = ['FULFILLED', 'CANCELLED'];

/** "Rok isporuke" card on the order detail (GET promise + commit). */
export function OrderPromiseCard({
  orderId,
  status,
  canCommit,
  onCommitted,
}: OrderPromiseCardProps) {
  const [data, setData] = useState<OrderPromiseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    api<OrderPromiseView>('GET', `/api/v1/orders/${orderId}/promise`)
      .then(setData)
      .catch((e: unknown) => setError(errorText(e)));
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function commit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ promisedAt: string }>(
        'POST',
        `/api/v1/orders/${orderId}/promise/commit`,
      );
      setNotice(`Rok isporuke potvrđen: ${formatPromiseDate(r.promisedAt)}.`);
      setConfirming(false);
      load();
      onCommitted?.(r.promisedAt);
    } catch (e: unknown) {
      setConfirming(false);
      if (e instanceof ApiRequestError && e.status === 409) {
        if (e.body.code === 'CONFLICT') {
          setError(
            'Narudžba je izmijenjena u međuvremenu. Rok je ponovo izračunat — provjerite ga i potvrdite ponovo.',
          );
          load();
        } else {
          setError('Ispunjena ili otkazana narudžba ne može dobiti rok isporuke.');
        }
      } else {
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const closed = CLOSED_STATUSES.includes(status);
  const committed = (data?.lines ?? [])
    .map((l) => l.committedPromise)
    .filter((d): d is string => !!d)
    .sort();
  const committedOrder = committed.length > 0 ? committed[committed.length - 1]! : null;
  const differing = (data?.lines ?? []).filter(
    (l) => l.committedPromise && !sameDate(l.committedPromise, l.promisedAt),
  ).length;
  const unCommitted = (data?.lines ?? []).filter((l) => !l.committedPromise).length;

  return (
    <section className="card" style={{ marginTop: 8 }} aria-label="Rok isporuke">
      <div className="spread">
        <h3 style={{ margin: 0 }}>Rok isporuke</h3>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={load} disabled={busy}>
            Osvježi
          </button>
          {canCommit ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || closed || !data || data.lines.length === 0}
              title={
                closed
                  ? 'Ispunjena ili otkazana narudžba ne prima rok isporuke.'
                  : 'Upiši izračunati rok na narudžbu i njene stavke'
              }
              onClick={() => setConfirming(true)}
            >
              Potvrdi rok
            </button>
          ) : null}
        </span>
      </div>
      {canCommit && closed ? (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Potvrda roka nije moguća: narudžba je ispunjena ili otkazana.
        </p>
      ) : null}
      {notice ? (
        <div className="alert alert-ok" role="status">
          {notice}
        </div>
      ) : null}
      {error ? <ErrorState text={error} /> : null}
      {!data && !error ? <LoadingState text="Računam rok isporuke…" /> : null}
      {data && data.lines.length === 0 ? (
        <EmptyState text="Nema otvorenih stavki za koje se računa rok." />
      ) : null}
      {data && data.lines.length > 0 ? (
        <>
          <div className="row" style={{ gap: 12, margin: '8px 0', flexWrap: 'wrap' }}>
            <span>
              Izračunati rok narudžbe:{' '}
              <strong className="mono">{formatPromiseDate(data.orderPromise)}</strong>
            </span>
            {committedOrder ? (
              <span>
                Potvrđeni rok: <strong className="mono">{formatPromiseDate(committedOrder)}</strong>{' '}
                {differing > 0 || unCommitted > 0 ? (
                  <span className="badge badge-warn">
                    {differing > 0
                      ? `Razlikuje se na ${differing} stavki`
                      : `${unCommitted} stavki bez potvrde`}
                  </span>
                ) : (
                  <span className="badge badge-ok">U skladu s izračunom</span>
                )}
              </span>
            ) : (
              <span className="muted">Rok još nije potvrđen.</span>
            )}
          </div>
          <PromiseLinesTable
            lines={data.lines}
            rowKey={(l) => l.lineId}
            label={(l) => <span>{l.description}</span>}
            extra={(l) =>
              l.committedPromise ? (
                <div style={{ fontSize: 12 }}>
                  Potvrđeno: <span className="mono">{formatPromiseDate(l.committedPromise)}</span>
                  {sameDate(l.committedPromise, l.promisedAt) ? null : (
                    <span className="badge badge-warn" style={{ marginLeft: 4 }}>
                      razlikuje se
                    </span>
                  )}
                </div>
              ) : null
            }
          />
        </>
      ) : null}
      {confirming && data ? (
        <ConfirmDialog
          open
          title="Potvrdi rok isporuke"
          consequence="Izračunati rok se upisuje na narudžbu i sve otvorene stavke (auditirano, vidljivo u historiji). Ako se narudžba u međuvremenu promijeni, potvrda se odbija i rok treba ponovo provjeriti."
          confirmLabel="Potvrdi rok"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void commit()}
        >
          <p>
            Rok narudžbe: <strong className="mono">{formatPromiseDate(data.orderPromise)}</strong>
          </p>
          {committedOrder && !sameDate(committedOrder, data.orderPromise) ? (
            <p className="muted">
              Zamjenjuje prethodno potvrđeni rok {formatPromiseDate(committedOrder)}.
            </p>
          ) : null}
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.lines.map((l) => (
              <li key={l.lineId}>
                {l.description} × {l.quantity} —{' '}
                <span className="mono">{formatPromiseDate(l.promisedAt)}</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
