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
 * HCM (Sprint 223): employee list + profile, existing attendance
 * records and leave request/approval — over the existing APIs only.
 * Amounts of authority live on the server (hcm.read / hcm.manage /
 * approval.act); the UI merely hides what the caller may not do.
 * This screen does NOT claim full HR-platform coverage (ODL-005).
 */

interface EmployeeView {
  id: string;
  employeeNumber: string;
  name: string;
  email: string | null;
  title: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  skills: string[];
}

interface AttendanceView {
  sessions: number;
  hours: string;
  open: boolean;
}

interface ApprovalView {
  id: string;
  title: string;
  status: 'REQUESTED' | 'GRANTED' | 'REJECTED';
  subjectObjectType: string;
  subjectObjectId: string;
}

interface LeaveRecord {
  leaveKey: string;
  approvalId: string;
  employeeName: string;
  type: string;
  from: string;
  to: string;
  status: 'NONE' | 'REQUESTED' | 'GRANTED' | 'REJECTED';
}

const STATUS_LABEL: Record<EmployeeView['status'], string> = {
  ACTIVE: 'Aktivan',
  INACTIVE: 'Neaktivan',
};

const LEAVE_LABEL: Record<LeaveRecord['status'], string> = {
  NONE: 'Nema zahtjeva',
  REQUESTED: 'Na odobravanju',
  GRANTED: 'Odobreno',
  REJECTED: 'Odbijeno',
};

const LEAVE_BADGE: Record<LeaveRecord['status'], string> = {
  NONE: '',
  REQUESTED: 'badge-warn',
  GRANTED: 'badge-ok',
  REJECTED: 'badge-danger',
};

const LEAVE_TYPES = ['Godišnji odmor', 'Bolovanje', 'Plaćeno odsustvo', 'Neplaćeno odsustvo'];

export default function HrPage() {
  const { can } = useApp();
  const canRead = can('hcm.read');
  const canManage = can('hcm.manage');
  const canApprove = can('approval.act');

  const [employees, setEmployees] = useState<EmployeeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceView | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Leave records known to this session (the backend keeps status per
  // leave key; requests made here are tracked and refreshed live).
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);

  // Forms & dialogs.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [editSkills, setEditSkills] = useState(false);
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0]!);
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<EmployeeView | null>(null);
  const [decideApproval, setDecideApproval] = useState<{
    approval: ApprovalView;
    decision: 'approve' | 'reject';
  } | null>(null);

  const load = useCallback(() => {
    if (!canRead) return;
    api<{ employees: EmployeeView[] }>('GET', '/api/v1/employees')
      .then((r) => {
        setEmployees(r.employees);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [canRead]);

  const loadApprovals = useCallback(() => {
    if (!canApprove) return;
    api<{ approvals: ApprovalView[] }>('GET', '/api/v1/approvals/pending')
      .then((r) => setApprovals(r.approvals.filter((a) => a.subjectObjectType === 'hcm_leave')))
      .catch(() => setApprovals([]));
  }, [canApprove]);

  const refreshLeaveStatuses = useCallback(() => {
    setLeaves((current) => {
      for (const record of current) {
        void api<{ status: LeaveRecord['status'] }>(
          'GET',
          `/api/v1/workforce/leave/status?key=${encodeURIComponent(record.leaveKey)}`,
        )
          .then((r) =>
            setLeaves((all) =>
              all.map((x) => (x.leaveKey === record.leaveKey ? { ...x, status: r.status } : x)),
            ),
          )
          .catch(() => undefined);
      }
      return current;
    });
  }, []);

  useEffect(load, [load]);
  useEffect(loadApprovals, [loadApprovals]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
      loadApprovals();
      refreshLeaveStatuses();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const selected = (employees ?? []).find((e) => e.id === selectedId) ?? null;

  function openEmployee(id: string) {
    setSelectedId(id);
    setEditSkills(false);
    setAttendance(null);
    setAttendanceError(null);
    api<AttendanceView>('GET', `/api/v1/workforce/employees/${id}/attendance`)
      .then((r) => setAttendance(r))
      .catch((e: unknown) => setAttendanceError(errorText(e)));
  }

  const filtered = (employees ?? []).filter(
    (e) => statusFilter === 'ALL' || e.status === statusFilter,
  );

  const columns: Array<Column<EmployeeView>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (e) => <span className="mono">{e.employeeNumber}</span>,
      text: (e) => e.employeeNumber,
    },
    { key: 'name', header: 'Ime i prezime', render: (e) => e.name, text: (e) => e.name },
    {
      key: 'title',
      header: 'Pozicija',
      render: (e) => e.title ?? <span className="muted">—</span>,
      text: (e) => e.title ?? '',
    },
    {
      key: 'skills',
      header: 'Vještine',
      render: (e) =>
        e.skills.length > 0 ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {e.skills.join(', ')}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
      text: (e) => e.skills.join(' '),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (e) => (
        <span className={`badge ${e.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}>
          {STATUS_LABEL[e.status]}
        </span>
      ),
      text: (e) => STATUS_LABEL[e.status],
    },
  ];

  return (
    <main className="page">
      <h1>Zaposleni</h1>
      <p className="page-sub">
        Matična evidencija zaposlenih, prisustvo i odsustva s odobravanjem — prava se provjeravaju
        na serveru.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {!canRead ? (
        <EmptyState text="Nemate pristup evidenciji zaposlenih — zatražite od administratora ulogu s dozvolom hcm.read." />
      ) : (
        <>
          <div className="grid-2">
            <div className="card">
              <h2>Evidencija zaposlenih</h2>
              <div className="row" style={{ marginBottom: 8 }}>
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  aria-label="Filter statusa"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                >
                  <option value="ALL">Svi statusi</option>
                  <option value="ACTIVE">Aktivni</option>
                  <option value="INACTIVE">Neaktivni</option>
                </select>
              </div>
              {employees === null ? (
                <LoadingState text="Učitavanje zaposlenih…" />
              ) : (
                <DataTable
                  columns={columns}
                  rows={filtered}
                  rowKey={(e) => e.id}
                  onRowClick={(e) => openEmployee(e.id)}
                  searchPlaceholder="Pretraga zaposlenih…"
                  emptyText="Još nema zaposlenih."
                />
              )}

              {canManage ? (
                <form
                  style={{ marginTop: 14 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api('POST', '/api/v1/employees', {
                        name,
                        ...(email ? { email } : {}),
                        ...(title ? { title } : {}),
                      });
                      setName('');
                      setEmail('');
                      setTitle('');
                    }, 'Zaposleni je dodat u evidenciju.');
                  }}
                >
                  <h3 style={{ marginBottom: 6 }}>Novi zaposleni</h3>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      style={{ maxWidth: 200 }}
                      placeholder="Ime i prezime"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 200 }}
                      type="email"
                      placeholder="E-mail (opcionalno)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 160 }}
                      placeholder="Pozicija (opcionalno)"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                      Dodaj zaposlenog
                    </button>
                  </div>
                </form>
              ) : null}
            </div>

            <div className="card">
              <h2>Profil zaposlenog</h2>
              {!selected ? (
                <EmptyState text="Odaberite zaposlenog iz evidencije." />
              ) : (
                <>
                  <div className="fact">
                    <span>Broj</span>
                    <span className="mono">{selected.employeeNumber}</span>
                  </div>
                  <div className="fact">
                    <span>Ime i prezime</span>
                    <span>{selected.name}</span>
                  </div>
                  <div className="fact">
                    <span>Pozicija</span>
                    <span>{selected.title ?? '—'}</span>
                  </div>
                  {canManage ? (
                    <div className="fact">
                      <span>E-mail</span>
                      <span>{selected.email ?? '—'}</span>
                    </div>
                  ) : null}
                  <div className="fact">
                    <span>Status</span>
                    <span
                      className={`badge ${selected.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}
                    >
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>
                  <div className="fact">
                    <span>Vještine</span>
                    <span>{selected.skills.length > 0 ? selected.skills.join(', ') : '—'}</span>
                  </div>

                  {canManage ? (
                    <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditSkills((v) => !v);
                          setSkillsInput(selected.skills.join(', '));
                        }}
                      >
                        Uredi vještine
                      </button>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmStatus(selected)}
                      >
                        {selected.status === 'ACTIVE' ? 'Deaktiviraj' : 'Aktiviraj'}
                      </button>
                    </div>
                  ) : null}
                  {editSkills && canManage ? (
                    <form
                      className="row"
                      style={{ marginTop: 8 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await api('POST', `/api/v1/employees/${selected.id}/skills`, {
                            skills: skillsInput
                              .split(',')
                              .map((x) => x.trim())
                              .filter(Boolean),
                          });
                          setEditSkills(false);
                        }, 'Vještine su ažurirane.');
                      }}
                    >
                      <input
                        className="input"
                        style={{ maxWidth: 280 }}
                        placeholder="Vještine, odvojene zarezom"
                        value={skillsInput}
                        onChange={(e) => setSkillsInput(e.target.value)}
                      />
                      <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                        Sačuvaj
                      </button>
                    </form>
                  ) : null}

                  <h3 style={{ marginTop: 16, marginBottom: 6 }}>Prisustvo</h3>
                  {attendanceError ? (
                    <ErrorState text={attendanceError} />
                  ) : attendance === null ? (
                    <LoadingState text="Učitavanje prisustva…" />
                  ) : (
                    <>
                      <div className="fact">
                        <span>Zaključene smjene</span>
                        <span className="mono">{attendance.sessions}</span>
                      </div>
                      <div className="fact">
                        <span>Ukupno sati</span>
                        <span className="mono">{attendance.hours}</span>
                      </div>
                      <div className="fact">
                        <span>Trenutno</span>
                        <span className={`badge ${attendance.open ? 'badge-ok' : ''}`}>
                          {attendance.open ? 'Prijavljen (na poslu)' : 'Odjavljen'}
                        </span>
                      </div>
                      {canManage ? (
                        <div className="row" style={{ marginTop: 8 }}>
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={busy || attendance.open}
                            title={attendance.open ? 'Zaposleni je već prijavljen' : undefined}
                            onClick={() =>
                              void run(async () => {
                                await api(
                                  'POST',
                                  `/api/v1/workforce/employees/${selected.id}/clock`,
                                  { event: 'IN', eventId: crypto.randomUUID().slice(0, 32) },
                                );
                                openEmployee(selected.id);
                              }, 'Dolazak je evidentiran.')
                            }
                          >
                            Evidentiraj dolazak
                          </button>
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={busy || !attendance.open}
                            title={!attendance.open ? 'Zaposleni nije prijavljen' : undefined}
                            onClick={() =>
                              void run(async () => {
                                await api(
                                  'POST',
                                  `/api/v1/workforce/employees/${selected.id}/clock`,
                                  { event: 'OUT', eventId: crypto.randomUUID().slice(0, 32) },
                                );
                                openEmployee(selected.id);
                              }, 'Odlazak je evidentiran.')
                            }
                          >
                            Evidentiraj odlazak
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}

                  {canManage ? (
                    <>
                      <h3 style={{ marginTop: 16, marginBottom: 6 }}>Zahtjev za odsustvo</h3>
                      <div className="row" style={{ flexWrap: 'wrap' }}>
                        <select
                          className="select"
                          style={{ maxWidth: 190 }}
                          aria-label="Vrsta odsustva"
                          value={leaveType}
                          onChange={(e) => setLeaveType(e.target.value)}
                        >
                          {LEAVE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          style={{ maxWidth: 150 }}
                          type="date"
                          aria-label="Od datuma"
                          value={leaveFrom}
                          onChange={(e) => setLeaveFrom(e.target.value)}
                        />
                        <input
                          className="input"
                          style={{ maxWidth: 150 }}
                          type="date"
                          aria-label="Do datuma"
                          value={leaveTo}
                          onChange={(e) => setLeaveTo(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          type="button"
                          disabled={busy || !leaveFrom || !leaveTo}
                          title={!leaveFrom || !leaveTo ? 'Unesite period odsustva' : undefined}
                          onClick={() => setConfirmLeave(true)}
                        >
                          Zatraži odsustvo
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <h2>Zahtjevi za odsustvo (ova sesija)</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
                Status se čita sa servera po ključu zahtjeva; odluka odmah ažurira evidenciju.
              </p>
              {leaves.length === 0 ? (
                <EmptyState text="Još nema zahtjeva u ovoj sesiji." />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Zaposleni</th>
                      <th>Vrsta</th>
                      <th>Period</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((l) => (
                      <tr key={l.leaveKey}>
                        <td>{l.employeeName}</td>
                        <td>{l.type}</td>
                        <td className="mono">
                          {l.from} → {l.to}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`badge ${LEAVE_BADGE[l.status]}`}>
                            {LEAVE_LABEL[l.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {canApprove ? (
              <div className="card">
                <h2>Odobravanje odsustava</h2>
                <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
                  Vlastite zahtjeve ne možete odobriti (razdvajanje dužnosti na serveru).
                </p>
                {approvals.length === 0 ? (
                  <EmptyState text="Nema zahtjeva na čekanju." />
                ) : (
                  approvals.map((a) => (
                    <div key={a.id} className="row spread" style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5 }}>{a.title}</span>
                      <span className="row">
                        <button
                          className="btn btn-sm btn-primary"
                          type="button"
                          disabled={busy}
                          onClick={() => setDecideApproval({ approval: a, decision: 'approve' })}
                        >
                          Odobri
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          type="button"
                          disabled={busy}
                          onClick={() => setDecideApproval({ approval: a, decision: 'reject' })}
                        >
                          Odbij
                        </button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </>
      )}

      {confirmLeave && selected ? (
        <ConfirmDialog
          open
          title="Zahtjev za odsustvo"
          consequence="Zahtjev ide na odobravanje; evidencija se ažurira tek nakon odluke odobravatelja."
          confirmLabel="Pošalji zahtjev"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              const r = await api<{ approvalId: string; leaveKey: string }>(
                'POST',
                '/api/v1/workforce/leave',
                {
                  employeeId: selected.id,
                  from: leaveFrom,
                  to: leaveTo,
                  type: leaveType,
                },
              );
              setLeaves((all) => [
                {
                  leaveKey: r.leaveKey,
                  approvalId: r.approvalId,
                  employeeName: selected.name,
                  type: leaveType,
                  from: leaveFrom,
                  to: leaveTo,
                  status: 'REQUESTED',
                },
                ...all,
              ]);
              setConfirmLeave(false);
              setLeaveFrom('');
              setLeaveTo('');
            }, 'Zahtjev za odsustvo je poslat na odobravanje.')
          }
          onCancel={() => setConfirmLeave(false)}
        >
          <div className="fact">
            <span>Zaposleni</span>
            <span>{selected.name}</span>
          </div>
          <div className="fact">
            <span>Vrsta</span>
            <span>{leaveType}</span>
          </div>
          <div className="fact">
            <span>Period</span>
            <span className="mono">
              {leaveFrom} → {leaveTo}
            </span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirmStatus ? (
        <ConfirmDialog
          open
          title={
            confirmStatus.status === 'ACTIVE' ? 'Deaktivacija zaposlenog' : 'Aktivacija zaposlenog'
          }
          consequence={
            confirmStatus.status === 'ACTIVE'
              ? 'Neaktivan zaposleni se ne nudi u operativnim tokovima; evidencija ostaje sačuvana.'
              : 'Zaposleni ponovo postaje dostupan u operativnim tokovima.'
          }
          confirmLabel={confirmStatus.status === 'ACTIVE' ? 'Deaktiviraj' : 'Aktiviraj'}
          danger={confirmStatus.status === 'ACTIVE'}
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/employees/${confirmStatus.id}/status`, {
                status: confirmStatus.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
              });
              setConfirmStatus(null);
            }, 'Status zaposlenog je ažuriran.')
          }
          onCancel={() => setConfirmStatus(null)}
        >
          <div className="fact">
            <span>Zaposleni</span>
            <span>{confirmStatus.name}</span>
          </div>
          <div className="fact">
            <span>Trenutni status</span>
            <span>{STATUS_LABEL[confirmStatus.status]}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {decideApproval ? (
        <ConfirmDialog
          open
          title={
            decideApproval.decision === 'approve' ? 'Odobravanje odsustva' : 'Odbijanje odsustva'
          }
          consequence={
            decideApproval.decision === 'approve'
              ? 'Odsustvo postaje odobreno i evidencija statusa se odmah ažurira.'
              : 'Zahtjev se odbija; zaposleni može podnijeti novi zahtjev.'
          }
          confirmLabel={decideApproval.decision === 'approve' ? 'Odobri odsustvo' : 'Odbij zahtjev'}
          danger={decideApproval.decision === 'reject'}
          busy={busy}
          onConfirm={() =>
            void run(
              async () => {
                await api(
                  'POST',
                  `/api/v1/approvals/${decideApproval.approval.id}/${decideApproval.decision}`,
                  {},
                );
                setDecideApproval(null);
              },
              decideApproval.decision === 'approve'
                ? 'Odsustvo je odobreno.'
                : 'Zahtjev je odbijen.',
            )
          }
          onCancel={() => setDecideApproval(null)}
        >
          <div className="fact">
            <span>Zahtjev</span>
            <span style={{ textAlign: 'right' }}>{decideApproval.approval.title}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
