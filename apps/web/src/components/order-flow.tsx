'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { api, ApiRequestError, errorText } from '../lib/api';
import { ConfirmDialog } from './ui';
import { money, SpecSummary, type MeasuredSpec } from './made-to-measure';

/**
 * "Tok narudžbe" (Sprint 248): the made-to-order flow of one sales order —
 * Ponuda → Potvrda → Avans → Proizvodnja → Montaža → Isporuka → Faktura →
 * Plaćeno. Every state is DERIVED from data the server returns (order
 * status, the order's invoices, work orders and installation visits); every
 * action is a server command behind a ConfirmDialog. Steps whose data the
 * person may not read are shown as "not visible", never guessed.
 */

export interface FlowOrderLine {
  id: string;
  description: string;
  backordered: boolean;
  spec?: MeasuredSpec | null;
}

export interface FlowOrder {
  id: string;
  orderNumber: string;
  status: 'DRAFT' | 'CONFIRMED' | 'ON_HOLD' | 'FULFILLED' | 'CANCELLED';
  quoteId: string | null;
  currency: string;
  total: string;
  lines: FlowOrderLine[];
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  orderRefId: string;
  currency: string;
  total: string;
  paidAmount: string;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  invoiceKind?: string;
  advanceDeducted?: string | null;
}

interface WorkOrderRow {
  id: string;
  woNumber: string;
  status: 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  quantity: string;
  goodQuantity: string;
  spec: MeasuredSpec | null;
}

interface VisitRow {
  id: string;
  orderNumber: string;
  kind: string;
  status: string;
  siteAddress: string | null;
  slotStart: string | null;
  slotEnd: string | null;
}

interface ProductionResult {
  orderNumber: string;
  created: Array<{ id: string; woNumber: string }>;
  existing: string[];
  skipped: Array<{ lineId: string; description: string; reason: string }>;
}

/** Reads that may be forbidden for this person: null = loading, 'hidden' = no access. */
type Readable<T> = T[] | null | 'hidden';

type StepState = 'done' | 'active' | 'pending' | 'blocked' | 'skipped' | 'hidden';

type ActionKind =
  'confirm' | 'advance' | 'production' | 'installation' | 'release' | 'fulfill' | 'final';

interface Step {
  key: string;
  label: string;
  state: StepState;
  detail: ReactNode;
  action?: { kind: ActionKind; label: string };
  link?: { href: string; label: string };
}

const STATE_BADGE: Record<StepState, { cls: string; text: string }> = {
  done: { cls: 'badge-ok', text: 'Završeno' },
  active: { cls: 'badge-accent', text: 'Na redu' },
  pending: { cls: '', text: 'Čeka' },
  blocked: { cls: 'badge-warn', text: 'Blokirano' },
  skipped: { cls: '', text: 'Preskočeno' },
  hidden: { cls: '', text: 'Nije vidljivo' },
};

const WO_LABELS: Record<WorkOrderRow['status'], string> = {
  PLANNED: 'planiran',
  RELEASED: 'pušten',
  IN_PROGRESS: 'u izradi',
  PAUSED: 'pauziran',
  COMPLETED: 'završen',
  CANCELLED: 'otkazan',
};

const VISIT_LABELS: Record<string, string> = {
  PLANNED: 'čeka termin',
  SCHEDULED: 'zakazana',
  IN_PROGRESS: 'u toku',
  DONE: 'završena',
  CANCELLED: 'otkazana',
};

const SKIP_REASONS: Record<string, string> = {
  NO_RELEASED_BOM: 'nema objavljene sastavnice (BOM) za proizvod',
};

const INVOICE_STATUS: Record<InvoiceRow['status'], string> = {
  OPEN: 'otvorena',
  PARTIALLY_PAID: 'djelimično plaćena',
  PAID: 'plaćena',
  VOID: 'stornirana',
};

function readList<T>(
  enabled: boolean,
  path: string,
  pick: (r: Record<string, unknown>) => unknown,
): Promise<Readable<T>> {
  if (!enabled) return Promise.resolve('hidden');
  return api<Record<string, unknown>>('GET', path).then(
    (r) => (pick(r) as T[]) ?? [],
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 403) return 'hidden' as const;
      throw e;
    },
  );
}

function when(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('bs-BA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------ styles */

const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };

function dot(state: StepState): CSSProperties {
  const base: CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
    flex: 'none',
    border: '2px solid var(--color-border-strong)',
    background: 'var(--color-surface)',
    color: 'var(--color-muted-solid)',
  };
  if (state === 'done') {
    return {
      ...base,
      background: 'var(--color-ok)',
      borderColor: 'var(--color-ok)',
      color: 'var(--color-surface)',
    };
  }
  if (state === 'active') {
    return {
      ...base,
      borderColor: 'var(--color-accent)',
      color: 'var(--color-accent)',
      boxShadow: '0 0 0 4px var(--color-accent-soft)',
    };
  }
  if (state === 'blocked') {
    return { ...base, borderColor: 'var(--color-warn)', color: 'var(--color-warn)' };
  }
  return base;
}

/* --------------------------------------------------------- component */

interface OrderFlowProps {
  order: FlowOrder;
  can: (permission: string) => boolean;
  /** Called after a successful mutation so the page reloads the order. */
  onChanged: () => void;
}

export function OrderFlow({ order, can, onChanged }: OrderFlowProps) {
  const [invoices, setInvoices] = useState<Readable<InvoiceRow>>(null);
  const [workOrders, setWorkOrders] = useState<Readable<WorkOrderRow>>(null);
  const [visits, setVisits] = useState<Readable<VisitRow>>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<ActionKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancePct, setAdvancePct] = useState('30');
  const [siteAddress, setSiteAddress] = useState('');
  const [production, setProduction] = useState<ProductionResult | null>(null);
  const [createdVisit, setCreatedVisit] = useState<VisitRow | null>(null);
  const [result, setResult] = useState<ReactNode>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void Promise.allSettled([
      readList<InvoiceRow>(can('finance.read'), '/api/v1/finance/invoices', (r) => r.invoices),
      readList<WorkOrderRow>(
        can('production.read'),
        `/api/v1/work-orders/by-order/${order.id}`,
        (r) => r.workOrders,
      ),
      readList<VisitRow>(
        can('service.read'),
        `/api/v1/service/visits/by-order/${order.id}`,
        (r) => r.visits,
      ),
    ]).then(([inv, wo, vis]) => {
      const errors: string[] = [];
      if (inv.status === 'fulfilled') {
        const v = inv.value;
        setInvoices(
          Array.isArray(v)
            ? v.filter((i) => i.orderRefId === order.id && i.invoiceType === 'CUSTOMER')
            : v,
        );
      } else {
        setInvoices([]);
        errors.push(`Fakture: ${errorText(inv.reason)}`);
      }
      if (wo.status === 'fulfilled') setWorkOrders(wo.value);
      else {
        setWorkOrders([]);
        errors.push(`Proizvodnja: ${errorText(wo.reason)}`);
      }
      if (vis.status === 'fulfilled') setVisits(vis.value);
      else {
        setVisits([]);
        errors.push(`Montaža: ${errorText(vis.reason)}`);
      }
      setLoadError(errors.length > 0 ? errors.join(' · ') : null);
    });
  }, [order.id, order.status]);

  useEffect(() => {
    load();
  }, [load]);

  const loading = invoices === null || workOrders === null || visits === null;

  /* ---------------------------------------------- derived states */

  const status = order.status;
  const confirmed = status === 'CONFIRMED' || status === 'ON_HOLD' || status === 'FULFILLED';
  const open = status === 'CONFIRMED' || status === 'ON_HOLD';
  const cancelled = status === 'CANCELLED';

  const invoiceList = Array.isArray(invoices) ? invoices.filter((i) => i.status !== 'VOID') : [];
  const advance = invoiceList.find((i) => i.invoiceKind === 'ADVANCE');
  const finalInvoice = invoiceList.find((i) => i.invoiceKind !== 'ADVANCE');
  const woList = Array.isArray(workOrders) ? workOrders : [];
  const liveWos = woList.filter((w) => w.status !== 'CANCELLED');
  const doneWos = liveWos.filter((w) => w.status === 'COMPLETED');
  const visitList = Array.isArray(visits)
    ? visits.filter((v) => v.kind === 'INSTALLATION' && v.status !== 'CANCELLED')
    : [];
  const visit = visitList[0];
  const backordered = order.lines.filter((l) => l.backordered);

  const steps: Step[] = [];

  steps.push({
    key: 'quote',
    label: 'Ponuda',
    state: order.quoteId ? 'done' : 'skipped',
    detail: order.quoteId ? 'Narudžba je nastala iz prihvaćene ponude.' : 'Direktna narudžba.',
    ...(order.quoteId ? { link: { href: '/quotes', label: 'Ponude' } } : {}),
  });

  steps.push({
    key: 'confirmed',
    label: 'Narudžba potvrđena',
    state: confirmed ? 'done' : cancelled ? 'blocked' : 'active',
    detail: confirmed
      ? status === 'ON_HOLD'
        ? 'Potvrđena, trenutno na čekanju.'
        : 'Potvrđena — zalihe rezervisane ili evidentirane kao zaostatak.'
      : cancelled
        ? 'Narudžba je otkazana.'
        : order.lines.length === 0
          ? 'Dodajte stavke prije potvrde.'
          : 'Nacrt — potvrda rezerviše zalihe.',
    ...(status === 'DRAFT' && order.lines.length > 0 && can('order.confirm')
      ? { action: { kind: 'confirm' as const, label: 'Potvrdi narudžbu' } }
      : {}),
  });

  if (invoices === 'hidden') {
    steps.push({
      key: 'advance',
      label: 'Avans',
      state: 'hidden',
      detail: 'Fakture nisu vidljive bez dozvole za čitanje finansija.',
    });
  } else {
    steps.push({
      key: 'advance',
      label: 'Avans',
      state: advance ? 'done' : open ? 'active' : status === 'FULFILLED' ? 'skipped' : 'pending',
      detail: advance ? (
        <>
          Avansna faktura <span className="mono">{advance.invoiceNumber}</span> ·{' '}
          <span className="mono">
            {money(advance.total)} {advance.currency}
          </span>{' '}
          · {INVOICE_STATUS[advance.status]}
        </>
      ) : open ? (
        'Opcionalno — avansna faktura prije proizvodnje.'
      ) : status === 'FULFILLED' ? (
        'Bez avansa.'
      ) : (
        'Nakon potvrde narudžbe.'
      ),
      ...(!advance && open && can('finance.invoice')
        ? { action: { kind: 'advance' as const, label: 'Izdaj avans' } }
        : {}),
    });
  }

  if (workOrders === 'hidden') {
    steps.push({
      key: 'production',
      label: 'Proizvodnja',
      state: 'hidden',
      detail: 'Radni nalozi nisu vidljivi bez dozvole za čitanje proizvodnje.',
    });
  } else {
    const allDone = liveWos.length > 0 && doneWos.length === liveWos.length;
    steps.push({
      key: 'production',
      label: 'Proizvodnja',
      state: allDone
        ? 'done'
        : liveWos.length > 0
          ? 'active'
          : open
            ? 'active'
            : status === 'FULFILLED'
              ? 'skipped'
              : 'pending',
      detail:
        liveWos.length > 0 ? (
          <>
            {doneWos.length} od {liveWos.length} radnih naloga završeno
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {liveWos.map((w) => (
                <li key={w.id} style={{ fontSize: 12.5 }}>
                  <span className="mono">{w.woNumber}</span> · {WO_LABELS[w.status]} ·{' '}
                  <span className="mono">
                    {w.goodQuantity}/{w.quantity}
                  </span>
                  <SpecSummary spec={w.spec} />
                </li>
              ))}
            </ul>
          </>
        ) : open ? (
          'Kreira radni nalog za svaku stavku s objavljenom sastavnicom.'
        ) : status === 'FULFILLED' ? (
          'Bez radnih naloga.'
        ) : (
          'Nakon potvrde narudžbe.'
        ),
      ...(liveWos.length === 0 && open && can('production.manage')
        ? { action: { kind: 'production' as const, label: 'Pokreni proizvodnju' } }
        : {}),
      ...(liveWos.length > 0 ? { link: { href: '/production', label: 'Proizvodnja' } } : {}),
    });
  }

  if (visits === 'hidden') {
    steps.push({
      key: 'installation',
      label: 'Montaža',
      state: 'hidden',
      detail: 'Montaže nisu vidljive bez dozvole za čitanje servisa.',
    });
  } else {
    const shown = visit ?? createdVisit ?? undefined;
    steps.push({
      key: 'installation',
      label: 'Montaža',
      state: shown
        ? shown.status === 'DONE'
          ? 'done'
          : 'active'
        : confirmed
          ? 'active'
          : 'pending',
      detail: shown ? (
        <>
          Montaža <span className="mono">{shown.orderNumber}</span> ·{' '}
          {VISIT_LABELS[shown.status] ?? shown.status}
          {shown.slotStart ? ` · ${when(shown.slotStart)}` : ''}
          {shown.siteAddress ? ` · ${shown.siteAddress}` : ''}
        </>
      ) : confirmed ? (
        'Kreira nalog za montažu; termin i ekipa se biraju na rasporedu montaža.'
      ) : (
        'Nakon potvrde narudžbe.'
      ),
      ...(!shown && confirmed && can('service.manage')
        ? { action: { kind: 'installation' as const, label: 'Zakaži montažu' } }
        : {}),
      ...(shown && shown.status !== 'DONE'
        ? {
            link: {
              href: `/installations?visit=${shown.id}`,
              label: shown.status === 'PLANNED' ? 'Odaberi termin' : 'Raspored montaža',
            },
          }
        : {}),
    });
  }

  steps.push({
    key: 'delivery',
    label: 'Isporuka',
    state:
      status === 'FULFILLED'
        ? 'done'
        : status === 'ON_HOLD'
          ? 'blocked'
          : status === 'CONFIRMED'
            ? 'active'
            : 'pending',
    detail:
      status === 'FULFILLED'
        ? 'Roba isporučena — izlaz knjižen u ledgeru.'
        : status === 'ON_HOLD'
          ? 'Narudžba je na čekanju — isporuka nije moguća dok se čekanje ne skine.'
          : status === 'CONFIRMED'
            ? backordered.length > 0
              ? `${backordered.length} ${backordered.length === 1 ? 'stavka čeka' : 'stavki čeka'} zalihu — rezerviši kada roba stigne iz proizvodnje.`
              : 'Spremno za isporuku — knjiži izlaz robe iz skladišta.'
            : 'Nakon potvrde narudžbe.',
    ...(status === 'CONFIRMED' && can('order.confirm')
      ? {
          action:
            backordered.length > 0
              ? { kind: 'release' as const, label: 'Oslobodi rezervaciju' }
              : { kind: 'fulfill' as const, label: 'Isporuči' },
        }
      : {}),
  });

  if (invoices === 'hidden') {
    steps.push({
      key: 'invoice',
      label: 'Faktura',
      state: 'hidden',
      detail: 'Fakture nisu vidljive bez dozvole za čitanje finansija.',
    });
    steps.push({
      key: 'paid',
      label: 'Plaćeno',
      state: 'hidden',
      detail: 'Uplate nisu vidljive bez dozvole za čitanje finansija.',
    });
  } else {
    steps.push({
      key: 'invoice',
      label: 'Faktura',
      state: finalInvoice ? 'done' : status === 'FULFILLED' ? 'active' : 'pending',
      detail: finalInvoice ? (
        <>
          Faktura <span className="mono">{finalInvoice.invoiceNumber}</span> ·{' '}
          <span className="mono">
            {money(finalInvoice.total)} {finalInvoice.currency}
          </span>
          {finalInvoice.advanceDeducted && Number(finalInvoice.advanceDeducted) > 0 ? (
            <>
              {' '}
              · odbijen avans{' '}
              <span className="mono">
                {money(finalInvoice.advanceDeducted)} {finalInvoice.currency}
              </span>
            </>
          ) : null}
        </>
      ) : status === 'FULFILLED' ? (
        advance ? (
          'Konačna faktura odbija izdati avans.'
        ) : (
          'Spremno za fakturisanje.'
        )
      ) : (
        'Nakon isporuke.'
      ),
      ...(!finalInvoice && status === 'FULFILLED' && can('finance.invoice')
        ? { action: { kind: 'final' as const, label: 'Konačna faktura' } }
        : {}),
    });

    const paid = finalInvoice?.status === 'PAID';
    steps.push({
      key: 'paid',
      label: 'Plaćeno',
      state: paid ? 'done' : finalInvoice ? 'active' : 'pending',
      detail: finalInvoice ? (
        <>
          Plaćeno{' '}
          <span className="mono">
            {money(finalInvoice.paidAmount)} od {money(finalInvoice.total)} {finalInvoice.currency}
          </span>
          {advance ? (
            <>
              {' '}
              · avans {INVOICE_STATUS[advance.status]} (
              <span className="mono">{money(advance.paidAmount)}</span>)
            </>
          ) : null}
        </>
      ) : (
        'Nakon konačne fakture.'
      ),
      ...(finalInvoice && !paid && can('finance.read')
        ? { link: { href: '/finance', label: 'Uplate u finansijama' } }
        : {}),
    });
  }

  const primaryKey = cancelled ? null : (steps.find((s) => s.action)?.key ?? null);
  const nextStep = cancelled ? undefined : steps.find((s) => s.action);

  /* -------------------------------------------------- mutations */

  async function execute(kind: ActionKind) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (kind === 'confirm') {
        await api('POST', `/api/v1/orders/${order.id}/confirm`);
        setResult('Narudžba potvrđena.');
      } else if (kind === 'advance') {
        const inv = await api<InvoiceRow>('POST', '/api/v1/finance/invoices/advance', {
          orderId: order.id,
          percent: Number(advancePct),
        });
        setResult(
          <>
            Avansna faktura <span className="mono">{inv.invoiceNumber}</span> izdana:{' '}
            <span className="mono">
              {money(inv.total)} {inv.currency}
            </span>
            .
          </>,
        );
      } else if (kind === 'production') {
        const r = await api<ProductionResult>('POST', '/api/v1/work-orders/from-order', {
          orderId: order.id,
        });
        setProduction(r);
      } else if (kind === 'installation') {
        const v = await api<VisitRow>('POST', '/api/v1/service/visits/installations', {
          salesOrderId: order.id,
          ...(siteAddress.trim() ? { siteAddress: siteAddress.trim() } : {}),
        });
        setCreatedVisit(v);
        setResult(
          <>
            Nalog za montažu <span className="mono">{v.orderNumber}</span> kreiran.{' '}
            <Link href={`/installations?visit=${v.id}`}>Odaberi termin i ekipu →</Link>
          </>,
        );
      } else if (kind === 'release') {
        await api('POST', `/api/v1/orders/${order.id}/release-backorders`);
        setResult('Rezervisano koliko zalihe dozvoljavaju — provjerite stavke u zaostatku.');
      } else if (kind === 'fulfill') {
        await api('POST', `/api/v1/orders/${order.id}/fulfill`);
        setResult('Narudžba isporučena — izlaz robe knjižen.');
      } else {
        const inv = await api<InvoiceRow>('POST', '/api/v1/finance/invoices/customer', {
          orderId: order.id,
        });
        setResult(
          <>
            Konačna faktura <span className="mono">{inv.invoiceNumber}</span>:{' '}
            <span className="mono">
              {money(inv.total)} {inv.currency}
            </span>
            {inv.advanceDeducted && Number(inv.advanceDeducted) > 0 ? (
              <>
                {' '}
                (odbijen avans{' '}
                <span className="mono">
                  {money(inv.advanceDeducted)} {inv.currency}
                </span>
                )
              </>
            ) : null}
            .
          </>,
        );
      }
      setDialog(null);
      load();
      onChanged();
    } catch (e: unknown) {
      setError(errorText(e));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }

  const orderFacts = (
    <>
      <div className="fact">
        <span>Narudžba</span>
        <span className="mono">{order.orderNumber}</span>
      </div>
      <div className="fact">
        <span>Iznos narudžbe</span>
        <span className="mono">
          {money(order.total)} {order.currency}
        </span>
      </div>
    </>
  );

  const pctValid = Number(advancePct) > 0 && Number(advancePct) <= 100;

  /* ----------------------------------------------------- render */

  return (
    <section
      aria-label="Tok narudžbe"
      style={{
        marginTop: 'var(--sp-4)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--sp-4)',
        background: 'var(--color-surface)',
      }}
    >
      <div className="spread" style={{ marginBottom: 'var(--sp-3)' }}>
        <strong>Tok narudžbe</strong>
        {nextStep ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            Sljedeće: <strong>{nextStep.action?.label}</strong>
          </span>
        ) : null}
      </div>

      {cancelled ? (
        <div className="alert alert-warn" role="status">
          Narudžba je otkazana — tok je zatvoren.
        </div>
      ) : null}
      {loadError ? <div className="alert alert-error">{loadError}</div> : null}
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="alert alert-ok" role="status">
          {result}
        </div>
      ) : null}

      {production ? (
        <div className="alert alert-ok" role="status">
          <strong>Proizvodnja za {production.orderNumber}</strong>
          <div>
            Kreirano:{' '}
            {production.created.length > 0
              ? production.created.map((w) => w.woNumber).join(', ')
              : 'ništa novo'}
          </div>
          {production.existing.length > 0 ? (
            <div>Već postoji: {production.existing.join(', ')}</div>
          ) : null}
          {production.skipped.length > 0 ? (
            <div>
              Preskočeno:
              <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                {production.skipped.map((s) => (
                  <li key={s.lineId}>
                    {s.description} — {SKIP_REASONS[s.reason] ?? s.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <div className="loading">Učitavanje toka narudžbe…</div> : null}

      {!loading ? (
        <ol style={list}>
          {steps.map((s, idx) => {
            const isPrimary = s.key === primaryKey;
            const last = idx === steps.length - 1;
            return (
              <li
                key={s.key}
                style={{ display: 'flex', gap: 'var(--sp-3)' }}
                aria-current={isPrimary ? 'step' : undefined}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <span style={dot(s.state)} aria-hidden="true">
                    {s.state === 'done' ? '✓' : idx + 1}
                  </span>
                  {!last ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 2,
                        flex: 1,
                        minHeight: 12,
                        background:
                          s.state === 'done' ? 'var(--color-ok)' : 'var(--color-border-strong)',
                        opacity: s.state === 'done' ? 0.5 : 1,
                      }}
                    />
                  ) : null}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    paddingBottom: last ? 0 : 'var(--sp-4)',
                    opacity: s.state === 'pending' || s.state === 'skipped' ? 0.75 : 1,
                  }}
                >
                  <div className="spread" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 'var(--sp-2)' }}>
                        <strong style={{ fontSize: 14 }}>{s.label}</strong>
                        <span className={`badge ${STATE_BADGE[s.state].cls}`}>
                          {STATE_BADGE[s.state].text}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {s.detail}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 'var(--sp-2)' }}>
                      {s.link ? (
                        <Link className="btn btn-sm" href={s.link.href}>
                          {s.link.label} →
                        </Link>
                      ) : null}
                      {s.action && !cancelled ? (
                        <button
                          type="button"
                          className={`btn btn-sm ${isPrimary ? 'btn-primary' : ''}`}
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            setDialog(s.action!.kind);
                          }}
                        >
                          {s.action.label}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {dialog === 'confirm' ? (
        <ConfirmDialog
          open
          title="Potvrda narudžbe"
          consequence="Potvrda rezerviše zalihe; ako zaliha nema, server odbija potvrdu (za zaostatak koristite „Potvrdi + zaostatak”)."
          confirmLabel="Potvrdi narudžbu"
          busy={busy}
          onConfirm={() => void execute('confirm')}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
        </ConfirmDialog>
      ) : null}

      {dialog === 'advance' ? (
        <ConfirmDialog
          open
          title="Izdavanje avansne fakture"
          consequence="Izdaje se avansna faktura kupcu; narudžba može imati samo jedan avans, a konačna faktura ga odbija."
          confirmLabel="Izdaj avans"
          busy={busy}
          onConfirm={() => {
            if (pctValid) void execute('advance');
          }}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
          <label className="label" htmlFor={`adv-pct-${order.id}`}>
            Procenat avansa (%)
          </label>
          <input
            id={`adv-pct-${order.id}`}
            className="input mono"
            style={{ maxWidth: 120 }}
            type="number"
            min="1"
            max="100"
            step="any"
            value={advancePct}
            onChange={(e) => setAdvancePct(e.target.value)}
          />
          {!pctValid ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Unesite procenat između 0 i 100.
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Tačan iznos računa server.
            </div>
          )}
        </ConfirmDialog>
      ) : null}

      {dialog === 'production' ? (
        <ConfirmDialog
          open
          title="Pokretanje proizvodnje"
          consequence="Kreira radni nalog za svaku otvorenu stavku s objavljenom sastavnicom; ponovljeno pokretanje ne pravi duplikate."
          confirmLabel="Pokreni proizvodnju"
          busy={busy}
          onConfirm={() => void execute('production')}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
          <div className="fact">
            <span>Stavki</span>
            <span>{order.lines.length}</span>
          </div>
          {order.lines
            .filter((l) => l.spec)
            .map((l) => (
              <div key={l.id} style={{ fontSize: 12.5, paddingTop: 4 }}>
                {l.description}
                <SpecSummary spec={l.spec} />
              </div>
            ))}
        </ConfirmDialog>
      ) : null}

      {dialog === 'installation' ? (
        <ConfirmDialog
          open
          title="Nalog za montažu"
          consequence="Kreira nalog za montažu za ovu narudžbu; termin, ekipa i vozilo se biraju na rasporedu montaža."
          confirmLabel="Kreiraj montažu"
          busy={busy}
          onConfirm={() => void execute('installation')}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
          <label className="label" htmlFor={`site-${order.id}`}>
            Adresa montaže (opcionalno)
          </label>
          <input
            id={`site-${order.id}`}
            className="input"
            maxLength={300}
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {dialog === 'release' ? (
        <ConfirmDialog
          open
          title="Rezervacija zaostalih stavki"
          consequence="Server rezerviše zaostale stavke koliko trenutne zalihe dozvoljavaju; ostatak ostaje u zaostatku."
          confirmLabel="Oslobodi rezervaciju"
          busy={busy}
          onConfirm={() => void execute('release')}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
          {backordered.map((l) => (
            <div key={l.id} className="fact">
              <span>{l.description}</span>
              <span className="badge badge-warn">zaostatak</span>
            </div>
          ))}
        </ConfirmDialog>
      ) : null}

      {dialog === 'fulfill' ? (
        <ConfirmDialog
          open
          title="Isporuka narudžbe"
          consequence="Knjiži stvarni izlaz robe iz skladišta (ledger) za sve stavke — ne može se poništiti, samo kroz povrat."
          confirmLabel="Isporuči"
          busy={busy}
          onConfirm={() => void execute('fulfill')}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
        </ConfirmDialog>
      ) : null}

      {dialog === 'final' ? (
        <ConfirmDialog
          open
          title="Konačna faktura"
          consequence="Izdaje se konačna faktura kupcu; izdati avans se odbija od iznosa. Ponovno fakturisanje iste narudžbe server odbija."
          confirmLabel="Izdaj konačnu fakturu"
          busy={busy}
          onConfirm={() => void execute('final')}
          onCancel={() => setDialog(null)}
        >
          {orderFacts}
          <div className="fact">
            <span>Avans</span>
            <span className="mono">
              {advance
                ? `${advance.invoiceNumber} · ${money(advance.total)} ${advance.currency}`
                : 'nema'}
            </span>
          </div>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
