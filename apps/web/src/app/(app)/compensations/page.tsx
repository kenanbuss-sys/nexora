'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import { getStoredLegalEntity } from '../../../lib/entity';

/**
 * FIN-032 (Sprint 214) — compensation: offset a partner's open
 * receivables against payables. Draft → review → explicit confirm
 * (payments + one COMPENSATION ledger entry) → printable document →
 * controlled cancel with a reason.
 */

interface LegalEntity {
  id: string;
  name: string;
}

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

export default function CompensationsPage() {
  const { can } = useApp();
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [entityId, setEntityId] = useState('');
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [items, setItems] = useState<OpenItem[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<CompRow[]>([]);
  const [open, setOpen] = useState<CompView | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ legalEntities: LegalEntity[] }>('GET', '/api/v1/organization/tree')
      .then((r) => {
        setEntities(r.legalEntities);
        const stored = getStoredLegalEntity();
        const preferred = r.legalEntities.find((le) => le.id === stored) ?? r.legalEntities[0];
        if (preferred) setEntityId((prev) => prev || preferred.id);
      })
      .catch((e: unknown) => setError(errorText(e)));
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
      <p>Datum: ${view.bookingDate} · Partner: ${view.partnerName} · Status: ${view.status}</p>
      <h3>Potraživanja (kupac)</h3><table><tr><th>Faktura</th><th>Iznos</th></tr>${rowsHtml('RECEIVABLE')}</table>
      <h3>Obaveze (dobavljač)</h3><table><tr><th>Faktura</th><th>Iznos</th></tr>${rowsHtml('PAYABLE')}</table>
      <p><strong>Ukupno kompenzirano: ${view.totalAmount} ${view.currency}</strong></p>
      <div class="sig"><div>Za pravno lice</div><div>Za partnera</div></div>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div>
      <div className="spread">
        <h1>Kompenzacije</h1>
        <select
          className="input"
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value);
            setOpen(null);
          }}
        >
          {entities.map((le) => (
            <option key={le.id} value={le.id}>
              {le.name}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="alert alert-error">{error}</p> : null}
      {notice ? <p className="alert alert-ok">{notice}</p> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Kompenzacije</h2>
          {rows.length === 0 ? <p>Nema kompenzacija.</p> : null}
          {rows.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Broj</th>
                  <th>Datum</th>
                  <th>Iznos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => void openView(c.id)}>
                    <td>{c.compensationNumber}</td>
                    <td>{c.bookingDate}</td>
                    <td>
                      {c.totalAmount} {c.currency}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[c.status] ?? ''}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      onClick={() =>
                        void run(async () => {
                          await api('POST', `/api/v1/compensations/${open.id}/confirm`);
                          await openView(open.id);
                        }, 'Kompenzacija potvrđena i proknjižena (jedan COMPENSATION nalog).')
                      }
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
                      <td>{l.side === 'RECEIVABLE' ? 'Potraživanje' : 'Obaveza'}</td>
                      <td>{l.invoiceNumber}</td>
                      <td>
                        {l.amount} {open.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {open.status === 'CANCELLED' ? (
                <p className="alert alert-warn">Poništena: {open.cancelReason}</p>
              ) : null}
              {can('finance.pay') && open.status === 'CONFIRMED' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api('POST', `/api/v1/compensations/${open.id}/cancel`, {
                        reason: cancelReason,
                      });
                      await openView(open.id);
                    }, 'Kompenzacija poništena: uplate oslobođene, nalog storniran.');
                  }}
                >
                  <input
                    className="input"
                    placeholder="Razlog poništenja (obavezan)"
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
            {partnerId && items.length === 0 ? <p>Partner nema otvorenih stavki.</p> : null}
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
                        <td>{i.side === 'RECEIVABLE' ? 'Potraživanje' : 'Obaveza'}</td>
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
