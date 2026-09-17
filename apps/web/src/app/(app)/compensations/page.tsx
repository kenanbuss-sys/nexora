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
 * FIN-032 (Sprint 214) — compensation: offset a partner's open
 * receivables against payables. Draft → review → explicit confirm
 * (payments + one COMPENSATION ledger entry) → printable document →
 * controlled cancel with a reason.
 */

interface PartyOption {
  id: string;
  name: string;
}

interface OpenItem {
  invoiceId: string;
  invoiceNumber: string;
  side: 'RECEIVABLE' | 'PAYABLE';
  currency: string;
  total: string;
  open: string;
}

interface CompRow {
  id: string;
  compensationNumber: string;
  partnerId: string;
  currency: string;
  totalAmount: string;
  bookingDate: string;
  status: string;
}

interface CompLine {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  side: 'RECEIVABLE' | 'PAYABLE';
  amount: string;
  paymentId: string | null;
}

interface CompView extends CompRow {
  partnerName: string;
  glEntryId: string | null;
  cancelReason: string | null;
  lines: CompLine[];
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-warn',
  CONFIRMED: 'badge-ok',
  CANCELLED: '',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđena',
  CANCELLED: 'Poništena',
};

const SIDE_LABELS: Record<'RECEIVABLE' | 'PAYABLE', string> = {
  RECEIVABLE: 'Potraživanje',
  PAYABLE: 'Obaveza',
};

const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;
const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 10)}…` : id);

export default function CompensationsPage() {
  const { can, entities, legalEntityId: entityId } = useApp();

  const [parties, setParties] = useState<PartyOption[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [items, setItems] = useState<OpenItem[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<CompRow[] | null>(null);
  const [open, setOpen] = useState<CompView | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ parties: PartyOption[] }>('GET', '/api/v1/parties')
      .then((r) => setParties(r.parties))
      .catch(() => setParties([]));
  }, []);

  const load = useCallback(() => {
    if (!entityId) return;
    api<{ compensations: CompRow[] }>('GET', `/api/v1/compensations?legalEntityId=${entityId}`)
      .then((r) => {
        setRows(r.compensations);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [entityId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!entityId || !partnerId) {
      setItems([]);
      return;
    }
    api<{ items: OpenItem[] }>(
      'GET',
      `/api/v1/compensations/open-items?legalEntityId=${entityId}&partnerId=${partnerId}`,
    )
      .then((r) => {
        setItems(r.items);
        setAmounts({});
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [entityId, partnerId]);

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

  async function openView(id: string) {
    try {
      setOpen(await api<CompView>('GET', `/api/v1/compensations/${id}`));
      setCancelReason('');
      setConfirmDialog(false);
      setCancelDialog(false);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  }

  const picked = (side: 'RECEIVABLE' | 'PAYABLE') =>
    items
      .filter((i) => i.side === side && Number(amounts[i.invoiceId]) > 0)
      .map((i) => ({ invoiceId: i.invoiceId, amount: Number(amounts[i.invoiceId]) }));
  const sumR = picked('RECEIVABLE').reduce((s, l) => s + l.amount, 0);
  const sumP = picked('PAYABLE').reduce((s, l) => s + l.amount, 0);
  const balanced = Math.abs(sumR - sumP) < 0.005 && sumR > 0;

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('POST', '/api/v1/compensations', {
        legalEntityId: entityId,
        partnerId,
        bookingDate,
        receivables: picked('RECEIVABLE'),
        payables: picked('PAYABLE'),
      });
      setAmounts({});
    }, 'Nacrt kompenzacije kreiran — pregledajte i potvrdite.');
  }

  function printDocument(view: CompView) {
    const rowsHtml = (side: 'RECEIVABLE' | 'PAYABLE') =>
      view.lines
        .filter((l) => l.side === side)
        .map(
          (l) =>
            `<tr><td>${l.invoiceNumber}</td><td style="text-align:right">${l.amount} ${view.currency}</td></tr>`,
        )
        .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${view.compensationNumber}</title>
      <style>body{font-family:system-ui;margin:40px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #999;padding:6px;font-size:14px}
      .sig{margin-top:60px;display:flex;justify-content:space-between}.sig div{border-top:1px solid #111;width:40%;padding-top:6px;text-align:center}</style></head><body>
      <h1>IZJAVA O KOMPENZACIJI ${view.compensationNumber}</h1>
      <p>Datum: ${view.bookingDate} · Partner: ${view.partnerName} · Status: ${statusLabel(view.status)}</p>
      <h3>Potraživanja (kupac)</h3><table><tr><th>Faktura</th><th>Iznos</th></tr>${rowsHtml('RECEIVABLE')}</table>
      <h3>Obaveze (dobavljač)</h3><table><tr><th>Faktura</th><th>Iznos</th></tr>${rowsHtml('PAYABLE')}</table>
      <p><strong>Ukupno kompenzirano: ${view.totalAmount} ${view.currency}</strong></p>
      <div class="sig"><div>Za pravno lice</div><div>Za partnera</div></div>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  const columns: Array<Column<CompRow>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (c) => c.compensationNumber,
      text: (c) => c.compensationNumber,
    },
    { key: 'date', header: 'Datum', render: (c) => c.bookingDate, text: (c) => c.bookingDate },
    {
      key: 'amount',
      header: 'Iznos',
      align: 'right',
      render: (c) => `${c.totalAmount} ${c.currency}`,
      text: (c) => `${c.totalAmount} ${c.currency}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <span className={`badge ${STATUS_BADGE[c.status] ?? ''}`}>{statusLabel(c.status)}</span>
      ),
      text: (c) => statusLabel(c.status),
    },
  ];

  const entityName = entities.find((le) => le.id === entityId)?.name ?? '—';
  const linesBySide = (side: 'RECEIVABLE' | 'PAYABLE') =>
    open ? open.lines.filter((l) => l.side === side).length : 0;

  return (
    <div>
      <div className="spread">
        <h1>Kompenzacije</h1>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Aktivno pravno lice:{' '}
          <strong>{entities.find((le) => le.id === entityId)?.name ?? '—'}</strong> (mijenja se u
          traci iznad)
        </span>
      </div>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <p className="alert alert-ok">{notice}</p> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Kompenzacije</h2>
          {rows === null && !error ? <LoadingState text="Učitavanje kompenzacija…" /> : null}
          {rows !== null ? (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              onRowClick={(c) => void openView(c.id)}
              pageSize={10}
              emptyText="Nema kompenzacija za odabrano pravno lice."
            />
          ) : null}

          {open ? (
            <div>
              <div className="spread">
                <h2>
                  {open.compensationNumber} — {open.partnerName}
                </h2>
                <span>
                  <button className="btn" onClick={() => printDocument(open)}>
                    Dokument za štampu
                  </button>{' '}
                  {can('finance.pay') && open.status === 'DRAFT' ? (
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => setConfirmDialog(true)}
                    >
                      Potvrdi
                    </button>
                  ) : null}
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Strana</th>
                    <th>Faktura</th>
                    <th>Iznos</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{SIDE_LABELS[l.side]}</td>
                      <td>{l.invoiceNumber}</td>
                      <td>
                        {l.amount} {open.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {open.lines.length === 0 ? <EmptyState text="Kompenzacija nema stavki." /> : null}
              {open.glEntryId ? (
                <p className="muted mono">Nalog GK: {shortId(open.glEntryId)}</p>
              ) : null}
              {open.status === 'CANCELLED' ? (
                <p className="alert alert-warn">Poništena: {open.cancelReason}</p>
              ) : null}
              {can('finance.pay') && open.status === 'CONFIRMED' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (cancelReason.trim().length < 5) {
                      setError('Razlog poništenja je obavezan (najmanje 5 znakova).');
                      return;
                    }
                    setError(null);
                    setCancelDialog(true);
                  }}
                >
                  <input
                    className="input"
                    placeholder="Razlog poništenja (obavezan, najmanje 5 znakova)"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    required
                    minLength={5}
                  />
                  <button className="btn" disabled={busy} type="submit">
                    Poništi (kontrolisano)
                  </button>
                </form>
              ) : null}
              <ConfirmDialog
                open={confirmDialog}
                title={`Potvrda kompenzacije ${open.compensationNumber}`}
                consequence="Zatvara obje strane kroz tok plaćanja i knjiži TAČNO JEDAN nalog kompenzacije; potvrda u zaključanom periodu je odbijena."
                confirmLabel="Potvrdi kompenzaciju"
                busy={busy}
                onCancel={() => setConfirmDialog(false)}
                onConfirm={() =>
                  void run(async () => {
                    await api('POST', `/api/v1/compensations/${open.id}/confirm`);
                    setConfirmDialog(false);
                    await openView(open.id);
                  }, 'Kompenzacija potvrđena i proknjižena (jedan COMPENSATION nalog).')
                }
              >
                <div className="fact">
                  <span>Pravno lice</span>
                  <span>{entityName}</span>
                </div>
                <div className="fact">
                  <span>Partner</span>
                  <span>{open.partnerName}</span>
                </div>
                <div className="fact">
                  <span>Datum knjiženja</span>
                  <span>{open.bookingDate}</span>
                </div>
                <div className="fact">
                  <span>Ukupan iznos</span>
                  <span>
                    {open.totalAmount} {open.currency}
                  </span>
                </div>
                <div className="fact">
                  <span>Stavki (potraživanja / obaveze)</span>
                  <span>
                    {linesBySide('RECEIVABLE')} / {linesBySide('PAYABLE')}
                  </span>
                </div>
              </ConfirmDialog>
              <ConfirmDialog
                open={cancelDialog}
                title={`Poništenje kompenzacije ${open.compensationNumber}`}
                consequence="Oslobađa uplate negativnim ogledalima i stornira povezani nalog; historija se ne briše."
                confirmLabel="Poništi kompenzaciju"
                danger
                busy={busy}
                onCancel={() => setCancelDialog(false)}
                onConfirm={() =>
                  void run(async () => {
                    await api('POST', `/api/v1/compensations/${open.id}/cancel`, {
                      reason: cancelReason,
                    });
                    setCancelDialog(false);
                    await openView(open.id);
                  }, 'Kompenzacija poništena: uplate oslobođene, nalog storniran.')
                }
              >
                <div className="fact">
                  <span>Broj</span>
                  <span>{open.compensationNumber}</span>
                </div>
                <div className="fact">
                  <span>Iznos</span>
                  <span>
                    {open.totalAmount} {open.currency}
                  </span>
                </div>
                <div className="fact">
                  <span>Razlog</span>
                  <span>{cancelReason}</span>
                </div>
              </ConfirmDialog>
            </div>
          ) : null}
        </div>

        {can('finance.pay') ? (
          <div className="card">
            <h2>Nova kompenzacija</h2>
            <select
              className="input"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">Partner…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
            />
            {!partnerId ? (
              <EmptyState text="Odaberite partnera za pregled otvorenih stavki." />
            ) : null}
            {partnerId && items.length === 0 ? (
              <EmptyState text="Partner nema otvorenih stavki za kompenzaciju." />
            ) : null}
            {items.length > 0 ? (
              <form onSubmit={createDraft}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Strana</th>
                      <th>Faktura</th>
                      <th>Otvoreno</th>
                      <th>Iznos za kompenzaciju</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.invoiceId}>
                        <td>{SIDE_LABELS[i.side]}</td>
                        <td>{i.invoiceNumber}</td>
                        <td>
                          {i.open} {i.currency}
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            step="0.01"
                            min="0"
                            max={i.open}
                            value={amounts[i.invoiceId] ?? ''}
                            onChange={(e) =>
                              setAmounts((prev) => ({ ...prev, [i.invoiceId]: e.target.value }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Potraživanja {sumR.toFixed(2)} / Obaveze {sumP.toFixed(2)}{' '}
                  <span className={`badge ${balanced ? 'badge-ok' : 'badge-warn'}`}>
                    {balanced ? 'IZJEDNAČENO' : 'NEIZJEDNAČENO'}
                  </span>
                </p>
                <button className="btn btn-primary" disabled={busy || !balanced} type="submit">
                  Kreiraj nacrt
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
