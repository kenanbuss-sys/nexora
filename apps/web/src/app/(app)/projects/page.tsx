'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
 * Projekti (Sprint 226, PRJ-001..012): namjenski ekran nad postojećim
 * projektnim domenom — projekti/faze žive kao governed custom objekti,
 * troškovi/prihodi/change orderi na audit ledgeru, dokumenti kao
 * attachmenti, a narudžbe se vezuju ISKLJUČIVO stvarnim poljem
 * `projectRef` (nikad po sličnosti naziva). Klijent i odgovorna osoba
 * ne postoje u modelu — evidentirano u backlogu, ne izmišlja se.
 */

interface ProjectView {
  recordId: string;
  code: string;
  name: string;
  status: string;
  budget: number;
  currency: string;
}

interface Milestone {
  id: string;
  name: string;
  due: string | null;
  done: boolean;
}

interface Costing {
  budget: string;
  changeOrders: string;
  effectiveBudget: string;
  costs: Record<string, string>;
  procurement: string;
  totalCost: string;
  remaining: string;
}

interface Profitability {
  revenue: string;
  totalCost: string;
  profit: string;
  marginPct: string;
}

interface DocumentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
  projectRef: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  planiran: 'Planiran',
  aktivan: 'Aktivan',
  zavrsen: 'Završen',
};
const STATUS_BADGE: Record<string, string> = {
  planiran: '',
  aktivan: 'badge-ok',
  zavrsen: 'badge-info',
};
const COST_LABEL: Record<string, string> = {
  labor: 'Rad (satnice)',
  material: 'Materijal',
  subcontract: 'Podizvođači',
  other: 'Ostalo',
};
const ORDER_STATUS: Record<string, string> = {
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđena',
  ON_HOLD: 'Na čekanju',
  FULFILLED: 'Ispunjena',
  CANCELLED: 'Otkazana',
};

const fmt = (n: number | string, currency: string) =>
  `${Number(n).toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function ProjectsPage() {
  const { can } = useApp();
  const canRead = can('project.read');
  const canManage = can('project.manage');

  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [costing, setCosting] = useState<Costing | null>(null);
  const [profit, setProfit] = useState<Profitability | null>(null);
  const [documents, setDocuments] = useState<DocumentView[] | null>(null);
  const [linkedOrders, setLinkedOrders] = useState<OrderRow[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirmMilestone, setConfirmMilestone] = useState<Milestone | null>(null);

  const load = useCallback(() => {
    if (!canRead) return;
    api<{ projects: ProjectView[] }>('GET', '/api/v1/projects')
      .then((r) => {
        setProjects(r.projects);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [canRead]);
  useEffect(load, [load]);

  const openProject = useCallback((code: string) => {
    setSelectedCode(code);
    setMilestones(null);
    setCosting(null);
    setProfit(null);
    setDocuments(null);
    setLinkedOrders(null);
    setDetailError(null);
    const enc = encodeURIComponent(code);
    api<{ milestones: Milestone[] }>('GET', `/api/v1/projects/${enc}/milestones`)
      .then((r) => setMilestones(r.milestones))
      .catch((e: unknown) => setDetailError(errorText(e)));
    api<Costing>('GET', `/api/v1/projects/${enc}/costing`)
      .then(setCosting)
      .catch(() => setCosting(null));
    api<Profitability>('GET', `/api/v1/projects/${enc}/profitability`)
      .then(setProfit)
      .catch(() => setProfit(null));
    api<{ documents: DocumentView[] }>('GET', `/api/v1/projects/${enc}/documents`)
      .then((r) => setDocuments(r.documents))
      .catch(() => setDocuments([]));
    // Stvarna veza: narudžbe čiji projectRef == šifra projekta.
    api<{ orders: OrderRow[] }>('GET', '/api/v1/orders')
      .then((r) => setLinkedOrders(r.orders.filter((o) => o.projectRef === code)))
      .catch(() => setLinkedOrders([]));
  }, []);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
      if (selectedCode) openProject(selectedCode);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const selected = (projects ?? []).find((p) => p.code === selectedCode) ?? null;
  const filtered = (projects ?? []).filter(
    (p) => statusFilter === 'ALL' || p.status === statusFilter,
  );

  const columns: Array<Column<ProjectView>> = [
    {
      key: 'code',
      header: 'Šifra',
      render: (p) => <span className="mono">{p.code}</span>,
      text: (p) => p.code,
    },
    { key: 'name', header: 'Naziv', render: (p) => p.name, text: (p) => p.name },
    {
      key: 'budget',
      header: 'Budžet',
      align: 'right',
      render: (p) => <span className="mono">{fmt(p.budget, p.currency || 'EUR')}</span>,
      text: (p) => String(p.budget),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (p) => (
        <span className={`badge ${STATUS_BADGE[p.status] ?? ''}`}>
          {STATUS_LABEL[p.status] ?? p.status}
        </span>
      ),
      text: (p) => STATUS_LABEL[p.status] ?? p.status,
    },
  ];

  return (
    <main className="page">
      <h1>Projekti</h1>
      <p className="page-sub">
        Projekti i faze s troškovima, prihodima i povezanim dokumentima — iznosi dolaze isključivo
        iz stvarnih zapisa (troškovnik, change orderi, nabavka, prihod).
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {!canRead ? (
        <EmptyState text="Nemate pristup projektima — zatražite od administratora ulogu s dozvolom project.read." />
      ) : (
        <div className="grid-2">
          <div className="card">
            <h2>Svi projekti</h2>
            <div className="row" style={{ marginBottom: 8 }}>
              <select
                className="select"
                style={{ maxWidth: 180 }}
                aria-label="Filter statusa projekta"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Svi statusi</option>
                <option value="planiran">Planirani</option>
                <option value="aktivan">Aktivni</option>
                <option value="zavrsen">Završeni</option>
              </select>
            </div>
            {projects === null ? (
              <LoadingState text="Učitavanje projekata…" />
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(p) => p.recordId}
                onRowClick={(p) => openProject(p.code)}
                searchPlaceholder="Pretraga projekata…"
                emptyText="Još nema projekata."
              />
            )}
          </div>

          <div className="card">
            <h2>Detalj projekta</h2>
            {!selected ? (
              <EmptyState text="Odaberite projekat iz liste." />
            ) : (
              <>
                <div className="fact">
                  <span>Šifra</span>
                  <span className="mono">{selected.code}</span>
                </div>
                <div className="fact">
                  <span>Naziv</span>
                  <span style={{ textAlign: 'right' }}>{selected.name}</span>
                </div>
                <div className="fact">
                  <span>Status</span>
                  <span className={`badge ${STATUS_BADGE[selected.status] ?? ''}`}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </span>
                </div>
                {detailError ? <ErrorState text={detailError} /> : null}

                <h3 style={{ marginTop: 16, marginBottom: 6 }}>Finansijski pregled</h3>
                {costing === null ? (
                  <LoadingState text="Učitavanje troškovnika…" />
                ) : (
                  <>
                    <div className="fact">
                      <span>Budžet</span>
                      <span className="mono">{fmt(costing.budget, selected.currency)}</span>
                    </div>
                    {Number(costing.changeOrders) !== 0 ? (
                      <div className="fact">
                        <span>Change orderi</span>
                        <span className="mono">
                          {fmt(costing.changeOrders, selected.currency)} → efektivno{' '}
                          {fmt(costing.effectiveBudget, selected.currency)}
                        </span>
                      </div>
                    ) : null}
                    {Object.entries(costing.costs)
                      .filter(([, v]) => Number(v) !== 0)
                      .map(([kind, v]) => (
                        <div key={kind} className="fact">
                          <span>{COST_LABEL[kind] ?? kind}</span>
                          <span className="mono">{fmt(v, selected.currency)}</span>
                        </div>
                      ))}
                    {Number(costing.procurement) !== 0 ? (
                      <div className="fact">
                        <span>Nabavka (povezane NBN)</span>
                        <span className="mono">{fmt(costing.procurement, selected.currency)}</span>
                      </div>
                    ) : null}
                    <div className="fact">
                      <span>Ukupni troškovi</span>
                      <span className="mono">{fmt(costing.totalCost, selected.currency)}</span>
                    </div>
                    <div className="fact">
                      <span>Preostalo od budžeta</span>
                      <span
                        className="mono"
                        style={{
                          color: Number(costing.remaining) < 0 ? 'var(--color-danger)' : undefined,
                        }}
                      >
                        {fmt(costing.remaining, selected.currency)}
                      </span>
                    </div>
                  </>
                )}
                {profit && Number(profit.revenue) > 0 ? (
                  <>
                    <div className="fact">
                      <span>Prihod (evidentiran)</span>
                      <span className="mono">{fmt(profit.revenue, selected.currency)}</span>
                    </div>
                    <div className="fact">
                      <span>Rezultat</span>
                      <span
                        className="mono"
                        style={{
                          color:
                            Number(profit.profit) < 0 ? 'var(--color-danger)' : 'var(--color-ok)',
                        }}
                      >
                        {fmt(profit.profit, selected.currency)} ({profit.marginPct}% marža)
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                    Prihod još nije evidentiran — profitabilnost se ne prikazuje dok ne postoji
                    stvaran zapis.
                  </p>
                )}

                <h3 style={{ marginTop: 16, marginBottom: 6 }}>Faze</h3>
                {milestones === null ? (
                  <LoadingState text="Učitavanje faza…" />
                ) : milestones.length === 0 ? (
                  <EmptyState text="Projekat još nema definisanih faza." />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Faza</th>
                        <th>Rok</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m) => (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td className="mono">{m.due ?? '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {m.done ? (
                              <span className="badge badge-ok">✓ Završena</span>
                            ) : canManage ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                disabled={busy}
                                onClick={() => setConfirmMilestone(m)}
                              >
                                Označi završenom
                              </button>
                            ) : (
                              <span className="badge">U toku</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 style={{ marginTop: 16, marginBottom: 6 }}>Povezane narudžbe</h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                  Veza postoji samo kada narudžba nosi referencu ovog projekta.
                </p>
                {linkedOrders === null ? (
                  <LoadingState text="Učitavanje narudžbi…" />
                ) : linkedOrders.length === 0 ? (
                  <EmptyState text="Nijedna narudžba ne referencira ovaj projekat." />
                ) : (
                  <table className="table">
                    <tbody>
                      {linkedOrders.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <Link href="/orders" className="mono">
                              {o.orderNumber}
                            </Link>
                          </td>
                          <td style={{ textAlign: 'right' }} className="mono">
                            {fmt(o.total, o.currency)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="badge">{ORDER_STATUS[o.status] ?? o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 style={{ marginTop: 16, marginBottom: 6 }}>Dokumenti</h3>
                {documents === null ? (
                  <LoadingState text="Učitavanje dokumenata…" />
                ) : documents.length === 0 ? (
                  <EmptyState text="Još nema dokumenata na projektu." />
                ) : (
                  <table className="table">
                    <tbody>
                      {documents.map((d) => (
                        <tr key={d.id}>
                          <td>{d.fileName}</td>
                          <td className="muted" style={{ textAlign: 'right', fontSize: 12 }}>
                            {(d.sizeBytes / 1024).toFixed(0)} KB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {confirmMilestone && selected ? (
        <ConfirmDialog
          open
          title="Završetak faze"
          consequence="Faza se trajno označava završenom u projektnoj evidenciji (auditirano)."
          confirmLabel="Označi završenom"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api(
                'POST',
                `/api/v1/projects/${encodeURIComponent(selected.code)}/milestones/complete`,
                { milestoneRecordId: confirmMilestone.id },
              );
              setConfirmMilestone(null);
            }, 'Faza je označena završenom.')
          }
          onCancel={() => setConfirmMilestone(null)}
        >
          <div className="fact">
            <span>Projekat</span>
            <span>
              {selected.code} — {selected.name}
            </span>
          </div>
          <div className="fact">
            <span>Faza</span>
            <span>{confirmMilestone.name}</span>
          </div>
          <div className="fact">
            <span>Rok</span>
            <span className="mono">{confirmMilestone.due ?? '—'}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
