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

interface HeaderInfo {
  client: { partyId: string; name: string } | null;
  owner: { employeeId: string; name: string; title: string | null } | null;
}

interface PoRow {
  id: string;
  poNumber: string;
  status: string;
  total: string;
  currency: string;
}

interface PartyOption {
  id: string;
  name: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  title: string | null;
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
const PO_STATUS: Record<string, string> = {
  OPEN: 'Otvorena',
  PARTIALLY_RECEIVED: 'Djelimično primljena',
  RECEIVED: 'Primljena',
  CANCELLED: 'Otkazana',
};
/** Dozvoljeni tipovi projektnih dokumenata (server dodatno provjerava). */
const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,.pptx,.zip';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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
  const canPo = can('purchase.read');
  const canDocs = can('collab.use');
  const canTask = can('task.manage');

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
  const [header, setHeader] = useState<HeaderInfo | null>(null);
  const [linkedPos, setLinkedPos] = useState<PoRow[] | null>(null);
  const [assignClient, setAssignClient] = useState(false);
  const [assignOwner, setAssignOwner] = useState(false);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [chosenParty, setChosenParty] = useState('');
  const [chosenEmployee, setChosenEmployee] = useState('');
  const [newTask, setNewTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');

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
    setHeader(null);
    setLinkedPos(null);
    setDetailError(null);
    const enc = encodeURIComponent(code);
    api<{ project: unknown } & HeaderInfo>('GET', `/api/v1/projects/${enc}/header`)
      .then((r) => setHeader({ client: r.client, owner: r.owner }))
      .catch(() => setHeader({ client: null, owner: null }));
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
    api<{ purchaseOrders: PoRow[] }>('GET', `/api/v1/projects/${enc}/purchase-orders`)
      .then((r) => setLinkedPos(r.purchaseOrders))
      .catch(() => setLinkedPos(null));
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

  const openAssignClient = () => {
    setAssignClient(true);
    api<{ parties: PartyOption[] }>('GET', '/api/v1/parties?q=')
      .then((r) => setParties(r.parties))
      .catch(() => setParties([]));
  };
  const openAssignOwner = () => {
    setAssignOwner(true);
    api<{ employees: EmployeeOption[] }>('GET', '/api/v1/employees')
      .then((r) => setEmployees(r.employees))
      .catch(() => setEmployees([]));
  };

  const uploadDocument = (file: File) => {
    if (!selectedCode) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `Dokument je veći od 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB) — smanjite datoteku pa pokušajte ponovo.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = String(reader.result).split(',')[1] ?? '';
      const rec = (projects ?? []).find((p) => p.code === selectedCode);
      if (!rec) return;
      void run(
        () =>
          api('POST', '/api/v1/attachments', {
            entityType: 'prj_project',
            entityId: rec.recordId,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            dataBase64,
          }),
        'Dokument je dodat na projekat.',
      );
    };
    reader.readAsDataURL(file);
  };

  const downloadDocument = (doc: DocumentView) => {
    void api<DocumentView & { dataBase64: string }>('GET', `/api/v1/attachments/${doc.id}/download`)
      .then((r) => {
        const bytes = Uint8Array.from(atob(r.dataBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: r.contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = r.fileName;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

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
                <div className="fact">
                  <span>Klijent</span>
                  <span>
                    {header === null ? '…' : (header.client?.name ?? '—')}
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ marginLeft: 8 }}
                        disabled={busy}
                        onClick={openAssignClient}
                      >
                        {header?.client ? 'Promijeni' : 'Dodijeli'}
                      </button>
                    ) : null}
                  </span>
                </div>
                <div className="fact">
                  <span>Odgovorna osoba</span>
                  <span>
                    {header === null
                      ? '…'
                      : header.owner
                        ? `${header.owner.name}${header.owner.title ? ` (${header.owner.title})` : ''}`
                        : '—'}
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ marginLeft: 8 }}
                        disabled={busy}
                        onClick={openAssignOwner}
                      >
                        {header?.owner ? 'Promijeni' : 'Dodijeli'}
                      </button>
                    ) : null}
                  </span>
                </div>
                {canTask ? (
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setTaskTitle(`${selected.code}: `);
                        setNewTask(true);
                      }}
                    >
                      Novi zadatak za projekat
                    </button>
                    <Link href="/tasks" className="muted" style={{ fontSize: 12.5 }}>
                      Svi zadaci →
                    </Link>
                  </div>
                ) : null}
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

                {canPo ? (
                  <>
                    <h3 style={{ marginTop: 16, marginBottom: 6 }}>Nabavne narudžbenice</h3>
                    <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                      Samo NBN-ovi stvarno povezani s projektom (auditirani link).
                    </p>
                    {linkedPos === null ? (
                      <LoadingState text="Učitavanje nabavke…" />
                    ) : linkedPos.length === 0 ? (
                      <EmptyState text="Nijedna narudžbenica nije povezana s projektom." />
                    ) : (
                      <table className="table">
                        <tbody>
                          {linkedPos.map((po) => (
                            <tr key={po.id}>
                              <td>
                                <Link href="/procurement" className="mono">
                                  {po.poNumber}
                                </Link>
                              </td>
                              <td style={{ textAlign: 'right' }} className="mono">
                                {fmt(po.total, po.currency)}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="badge">{PO_STATUS[po.status] ?? po.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : null}

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
                {canDocs ? (
                  <div className="row" style={{ marginBottom: 8 }}>
                    <label
                      className="btn btn-sm"
                      style={{ cursor: busy ? 'not-allowed' : 'pointer' }}
                    >
                      Dodaj dokument
                      <input
                        type="file"
                        accept={UPLOAD_ACCEPT}
                        style={{ display: 'none' }}
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) uploadDocument(file);
                        }}
                      />
                    </label>
                    <span className="muted" style={{ fontSize: 12 }}>
                      PDF, slike, Office, CSV/TXT, ZIP — do 5 MB.
                    </span>
                  </div>
                ) : null}
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
                          <td style={{ textAlign: 'right' }}>
                            {canDocs ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => downloadDocument(d)}
                              >
                                Preuzmi
                              </button>
                            ) : null}
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

      {newTask && selected ? (
        <ConfirmDialog
          open
          title="Novi zadatak za projekat"
          consequence="Zadatak se kreira povezan s ovim projektom i pojavljuje se u Zadacima (auditirano)."
          confirmLabel="Kreiraj zadatak"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              const rec = (projects ?? []).find((p) => p.code === selected.code);
              await api('POST', '/api/v1/tasks', {
                title: taskTitle,
                relatedObjectType: 'prj_project',
                relatedObjectId: rec?.recordId ?? selected.code,
                ...(taskDue ? { dueAt: new Date(taskDue).toISOString() } : {}),
              });
              setNewTask(false);
              setTaskTitle('');
              setTaskDue('');
            }, 'Zadatak je kreiran i povezan s projektom.')
          }
          onCancel={() => setNewTask(false)}
        >
          <div className="fact">
            <span>Projekat</span>
            <span>
              {selected.code} — {selected.name}
            </span>
          </div>
          <label className="label" htmlFor="prj-task-title">
            Naslov zadatka
          </label>
          <input
            id="prj-task-title"
            className="input"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <label className="label" htmlFor="prj-task-due">
            Rok (opcionalno)
          </label>
          <input
            id="prj-task-due"
            className="input"
            type="date"
            value={taskDue}
            onChange={(e) => setTaskDue(e.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {assignClient && selected ? (
        <ConfirmDialog
          open
          title="Dodjela klijenta projektu"
          consequence="Klijent se bira iz postojećeg partner šifrarnika i evidentira auditirano; zadnja dodjela važi."
          confirmLabel="Dodijeli klijenta"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/projects/${encodeURIComponent(selected.code)}/client`, {
                partyId: chosenParty,
              });
              setAssignClient(false);
              setChosenParty('');
            }, 'Klijent je dodijeljen projektu.')
          }
          onCancel={() => setAssignClient(false)}
        >
          <div className="fact">
            <span>Projekat</span>
            <span>
              {selected.code} — {selected.name}
            </span>
          </div>
          <label className="label" htmlFor="prj-client">
            Partner (klijent)
          </label>
          <select
            id="prj-client"
            className="select"
            value={chosenParty}
            onChange={(e) => setChosenParty(e.target.value)}
          >
            <option value="">Odaberite partnera…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </ConfirmDialog>
      ) : null}

      {assignOwner && selected ? (
        <ConfirmDialog
          open
          title="Dodjela odgovorne osobe"
          consequence="Odgovorna osoba se bira iz postojeće evidencije zaposlenih; zadnja dodjela važi (auditirano)."
          confirmLabel="Dodijeli osobu"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/projects/${encodeURIComponent(selected.code)}/owner`, {
                employeeId: chosenEmployee,
              });
              setAssignOwner(false);
              setChosenEmployee('');
            }, 'Odgovorna osoba je dodijeljena.')
          }
          onCancel={() => setAssignOwner(false)}
        >
          <div className="fact">
            <span>Projekat</span>
            <span>
              {selected.code} — {selected.name}
            </span>
          </div>
          <label className="label" htmlFor="prj-owner">
            Zaposleni
          </label>
          <select
            id="prj-owner"
            className="select"
            value={chosenEmployee}
            onChange={(e) => setChosenEmployee(e.target.value)}
          >
            <option value="">Odaberite zaposlenog…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
                {emp.title ? ` — ${emp.title}` : ''}
              </option>
            ))}
          </select>
        </ConfirmDialog>
      ) : null}

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
