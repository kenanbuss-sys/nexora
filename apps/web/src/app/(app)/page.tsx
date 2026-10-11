'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useApp } from './app-shell';

interface Health {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  redis: 'up' | 'down';
  uptimeSeconds: number;
}

interface ExecutiveSummary {
  revenue: string;
  openReceivables: string;
  openPayables: string;
  openOrders: number;
  quotePipeline: string;
  wipOrders: number;
  scrapRatePct: string;
  openNcrs: number;
}

interface AgingSummary {
  totalOpen: string;
  buckets: Array<{ bucket: string; amount: string }>;
}

interface TaskRow {
  id: string;
  title: string;
  dueAt: string | null;
}

interface NotificationRow {
  id: string;
  title: string;
  createdAt: string;
}

/** The KPI home: what needs attention today, at a glance. */
export default function DashboardPage() {
  const { session, can } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    api<Health>('GET', '/health')
      .then(setHealth)
      .catch((e: unknown) => setHealthError(errorText(e)));
    if (can('analytics.read')) {
      api<ExecutiveSummary>('GET', '/api/v1/analytics/executive')
        .then(setSummary)
        .catch(() => setSummary(null));
    }
    if (can('finance.read')) {
      api<AgingSummary>('GET', '/api/v1/finance/aging?type=CUSTOMER')
        .then(setAging)
        .catch(() => setAging(null));
    }
    api<{ tasks: TaskRow[] }>('GET', '/api/v1/inbox')
      .then((r) => setTasks(r.tasks.slice(0, 5)))
      .catch(() => setTasks([]));
    api<{ notifications: NotificationRow[] }>('GET', '/api/v1/notifications')
      .then((r) => setNotifications(r.notifications.slice(0, 5)))
      .catch(() => setNotifications([]));
    // eslint-disable-next-line
  }, []);

  const overdue = aging
    ? aging.buckets
        .filter((b) => b.bucket !== 'NOT_DUE')
        .reduce((s, b) => s + Number(b.amount), 0)
        .toFixed(2)
    : null;

  return (
    <main className="page">
      <div className="spread">
        <h1>Moj posao danas</h1>
        {health ? (
          <span className="row" style={{ gap: 6 }}>
            <span className={`badge ${health.status === 'ok' ? 'badge-ok' : 'badge-danger'}`}>
              API {health.status}
            </span>
            <span className={`badge ${health.db === 'up' ? 'badge-ok' : 'badge-danger'}`}>
              DB {health.db}
            </span>
            <span className={`badge ${health.redis === 'up' ? 'badge-ok' : 'badge-danger'}`}>
              Redis {health.redis}
            </span>
          </span>
        ) : null}
      </div>
      <p className="page-sub">
        Prijavljeni ste kao <span className="mono">{session.subject}</span> · tenant{' '}
        <strong>{session.tenantSlug}</strong>
      </p>
      {healthError ? <div className="alert alert-error">{healthError}</div> : null}

      <TodayWork />

      <h2 style={{ marginTop: 8 }}>Kontrolna tabla</h2>
      {summary ? (
        <>
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <Link href="/finance" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Prihod (fakturisano)</div>
              <div className="stat-value">{summary.revenue}</div>
            </Link>
            <Link href="/finance" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Otvorena potraživanja</div>
              <div className="stat-value">{summary.openReceivables}</div>
              {overdue !== null && Number(overdue) > 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-danger, #b91c1c)' }}>
                  {overdue} dospjelo
                </div>
              ) : null}
            </Link>
            <Link href="/orders" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Otvorene narudžbe</div>
              <div className="stat-value">{summary.openOrders}</div>
            </Link>
            <Link href="/quotes" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Ponude u toku</div>
              <div className="stat-value">{summary.quotePipeline}</div>
            </Link>
          </div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <Link href="/production" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Nalozi u proizvodnji</div>
              <div className="stat-value">{summary.wipOrders}</div>
            </Link>
            <Link href="/quality" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Otvoreni NCR-ovi</div>
              <div
                className="stat-value"
                style={summary.openNcrs > 0 ? { color: 'var(--color-danger, #b91c1c)' } : {}}
              >
                {summary.openNcrs}
              </div>
            </Link>
            <Link href="/quality" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Stopa škarta</div>
              <div className="stat-value">{summary.scrapRatePct}%</div>
            </Link>
            <Link href="/finance" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Otvorene obaveze</div>
              <div className="stat-value">{summary.openPayables}</div>
            </Link>
          </div>
        </>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Brze akcije</h2>
        <div className="row">
          {can('inventory.read') ? (
            <Link href="/flow" className="btn btn-primary">
              Tok robe: artikl → prijem → otprema
            </Link>
          ) : null}
          {can('order.read') ? (
            <Link href="/orders" className="btn">
              Narudžbe
            </Link>
          ) : null}
          {can('inventory.read') ? (
            <Link href="/inventory" className="btn">
              Zalihe
            </Link>
          ) : null}
          {can('purchase.read') ? (
            <Link href="/procurement" className="btn">
              Nabavka
            </Link>
          ) : null}
          {can('finance.ledger.read') ? (
            <Link href="/ledger" className="btn">
              Glavna knjiga
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Moji zadaci</h2>
          {tasks.length === 0 ? <div className="empty">Ništa ne čeka na vas.</div> : null}
          {tasks.map((t) => (
            <div key={t.id} className="spread" style={{ padding: '5px 0', fontSize: 14 }}>
              <span>{t.title}</span>
              {t.dueAt ? (
                <span className="muted mono" style={{ fontSize: 12 }}>
                  {new Date(t.dueAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          ))}
          <Link href="/tasks" className="muted" style={{ fontSize: 13 }}>
            Svi zadaci →
          </Link>
        </div>
        <div className="card">
          <h2>Obavještenja</h2>
          {notifications.length === 0 ? <div className="empty">Sve je pregledano.</div> : null}
          {notifications.map((n) => (
            <div key={n.id} className="spread" style={{ padding: '5px 0', fontSize: 14 }}>
              <span>{n.title}</span>
              <span className="muted mono" style={{ fontSize: 12 }}>
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------
// "Moj posao danas" — role home built from GET /api/v1/home/today.
// The server returns only the sections the user's permissions allow;
// this view only presents counts and links (no business logic).
// ------------------------------------------------------------------

type Amount = string | number;

interface Visit {
  id: string;
  orderNumber: string | null;
  kind: 'MEASUREMENT' | 'INSTALLATION' | 'SERVICE';
  status: string;
  slotStart: string;
  slotEnd: string;
  siteAddress: string | null;
}

interface HomeToday {
  generatedAt: string;
  sales?: {
    draftQuotes: number;
    sentQuotes: number;
    ordersToConfirm: number;
    confirmedWithoutAdvance: number;
    measurementsNext7Days: number;
  };
  production?: {
    planned: number;
    released: number;
    inProgress: number;
    completedThisWeek: number;
    ordersWaitingForWorkOrders: number;
  };
  installation?: { next7Days: Visit[]; unscheduled: number };
  accounting?: {
    fulfilledNotInvoiced: number;
    openInvoices: number;
    openAmount: Amount;
    overdueInvoices: number;
    kifThisMonth: number;
  };
  management?: {
    revenueThisMonth: Amount;
    openOrdersValue: Amount;
    quotesWonLast30: number;
    quotesLostLast30: number;
    installationsDoneThisWeek: number;
  };
}

interface WorkNumber {
  label: string;
  value: Amount;
  href: string;
  /** Permission needed to open the target screen; link hidden without it. */
  permission: string;
  money?: boolean;
}

/** Bosnian plural form: 1 ponuda, 2 ponude, 5 ponuda. */
function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

function formatAmount(value: Amount): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const KIND_LABEL: Record<Visit['kind'], string> = {
  MEASUREMENT: 'Mjerenje',
  INSTALLATION: 'Montaža',
  SERVICE: 'Servis',
};

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  REQUESTED: { text: 'Traženo', tone: 'badge-warn' },
  PLANNED: { text: 'Planirano', tone: 'badge-info' },
  SCHEDULED: { text: 'Zakazano', tone: 'badge-info' },
  IN_PROGRESS: { text: 'U toku', tone: 'badge-accent' },
  COMPLETED: { text: 'Završeno', tone: 'badge-ok' },
  DONE: { text: 'Završeno', tone: 'badge-ok' },
  CANCELLED: { text: 'Otkazano', tone: 'badge-danger' },
};

function WorkCard({
  title,
  numbers,
  next,
  allClear,
  children,
}: {
  title: string;
  numbers: WorkNumber[];
  next: string | null;
  allClear: boolean;
  children?: ReactNode;
}) {
  const { can } = useApp();
  const headingId = `work-${title.toLowerCase()}`;
  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="spread">
        <h2 id={headingId} style={{ margin: 0 }}>
          {title}
        </h2>
        {allClear ? <span className="badge badge-ok">Sve je riješeno</span> : null}
      </div>
      <div className="work-nums">
        {numbers.map((n) => {
          const body = (
            <>
              <div className="work-num-value">
                {n.money ? formatAmount(n.value) : String(n.value)}
              </div>
              <div className="work-num-label">{n.label}</div>
            </>
          );
          return can(n.permission) ? (
            <Link key={n.label} href={n.href} className="work-num">
              {body}
            </Link>
          ) : (
            <div key={n.label} className="work-num">
              {body}
            </div>
          );
        })}
      </div>
      {children}
      <div className="work-next">
        <strong>Šta je sljedeće: </strong>
        {next ?? 'Sve je riješeno — nema posla koji čeka.'}
      </div>
    </section>
  );
}

function VisitList({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) {
    return <EmptyState text="U narednih 7 dana nema zakazanih posjeta." />;
  }
  const sorted = [...visits].sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
      {sorted.map((v) => {
        const start = new Date(v.slotStart);
        const end = new Date(v.slotEnd);
        const day = start.toLocaleDateString('bs-BA', {
          weekday: 'short',
          day: 'numeric',
          month: 'numeric',
        });
        const time = (d: Date) =>
          d.toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });
        const status = STATUS_LABEL[v.status] ?? { text: v.status, tone: 'badge-info' };
        return (
          <li
            key={v.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(84px, auto) 1fr',
              gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)',
              fontSize: 13.5,
            }}
          >
            <div>
              <div style={{ fontWeight: 650 }}>{day}</div>
              <div className="muted mono" style={{ fontSize: 12 }}>
                {time(start)}–{time(end)}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <strong>{KIND_LABEL[v.kind] ?? v.kind}</strong>
                {v.orderNumber ? <span className="mono muted">{v.orderNumber}</span> : null}
                <span className={`badge ${status.tone}`}>{status.text}</span>
              </div>
              <div className="muted" style={{ overflowWrap: 'anywhere' }}>
                {v.siteAddress ?? 'Adresa nije unesena'}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TodayWork() {
  const [data, setData] = useState<HomeToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    api<HomeToday>('GET', '/api/v1/home/today')
      .then(setData)
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const guideLink = (
    <Link href="/guide" className="btn btn-sm">
      Vodič za moju ulogu →
    </Link>
  );

  let body: ReactNode;
  if (loading && !data) {
    body = <LoadingState text="Učitavam vaš posao za danas…" />;
  } else if (error) {
    body = (
      <div>
        <ErrorState text={`Pregled posla nije učitan: ${error}`} />
        <button type="button" className="btn btn-sm" onClick={load}>
          Pokušaj ponovo
        </button>
      </div>
    );
  } else if (data) {
    const cards: ReactNode[] = [];
    const s = data.sales;
    if (s) {
      const next =
        s.confirmedWithoutAdvance > 0
          ? `${s.confirmedWithoutAdvance} ${plural(s.confirmedWithoutAdvance, 'potvrđena narudžba čeka', 'potvrđene narudžbe čekaju', 'potvrđenih narudžbi čeka')} avans — Narudžbe → Tok narudžbe → Izdaj avans.`
          : s.ordersToConfirm > 0
            ? `${s.ordersToConfirm} ${plural(s.ordersToConfirm, 'narudžba čeka', 'narudžbe čekaju', 'narudžbi čeka')} potvrdu.`
            : s.draftQuotes > 0
              ? `${s.draftQuotes} ${plural(s.draftQuotes, 'ponuda je', 'ponude su', 'ponuda je')} u pripremi — pošaljite ih kupcu.`
              : s.sentQuotes > 0
                ? `${s.sentQuotes} ${plural(s.sentQuotes, 'poslana ponuda čeka', 'poslane ponude čekaju', 'poslanih ponuda čeka')} odgovor kupca.`
                : null;
      cards.push(
        <WorkCard
          key="sales"
          title="Prodaja"
          next={next}
          allClear={next === null && s.measurementsNext7Days === 0}
          numbers={[
            {
              label: 'Ponude u pripremi',
              value: s.draftQuotes,
              href: '/quotes',
              permission: 'quote.read',
            },
            {
              label: 'Poslane ponude',
              value: s.sentQuotes,
              href: '/quotes',
              permission: 'quote.read',
            },
            {
              label: 'Narudžbe za potvrdu',
              value: s.ordersToConfirm,
              href: '/orders',
              permission: 'order.read',
            },
            {
              label: 'Čekaju avans',
              value: s.confirmedWithoutAdvance,
              href: '/orders',
              permission: 'order.read',
            },
            {
              label: 'Mjerenja (7 dana)',
              value: s.measurementsNext7Days,
              href: '/installations',
              permission: 'service.read',
            },
          ]}
        />,
      );
    }
    const p = data.production;
    if (p) {
      const next =
        p.ordersWaitingForWorkOrders > 0
          ? `${p.ordersWaitingForWorkOrders} ${plural(p.ordersWaitingForWorkOrders, 'narudžba čeka', 'narudžbe čekaju', 'narudžbi čeka')} radni nalog — Narudžbe → Tok narudžbe → Pokreni proizvodnju.`
          : p.planned > 0
            ? `${p.planned} ${plural(p.planned, 'planiran nalog čeka', 'planirana naloga čekaju', 'planiranih naloga čeka')} puštanje u rad.`
            : p.released > 0
              ? `${p.released} ${plural(p.released, 'pušten nalog čeka', 'puštena naloga čekaju', 'puštenih naloga čeka')} početak rada.`
              : p.inProgress > 0
                ? `${p.inProgress} ${plural(p.inProgress, 'nalog je', 'naloga su', 'naloga je')} u radu — završite ih s dobrom količinom.`
                : null;
      cards.push(
        <WorkCard
          key="production"
          title="Proizvodnja"
          next={next}
          allClear={next === null}
          numbers={[
            {
              label: 'Čekaju radni nalog',
              value: p.ordersWaitingForWorkOrders,
              href: '/orders',
              permission: 'order.read',
            },
            {
              label: 'Planirano',
              value: p.planned,
              href: '/production',
              permission: 'production.read',
            },
            {
              label: 'Pušteno',
              value: p.released,
              href: '/production',
              permission: 'production.read',
            },
            {
              label: 'U radu',
              value: p.inProgress,
              href: '/production',
              permission: 'production.read',
            },
            {
              label: 'Završeno ove sedmice',
              value: p.completedThisWeek,
              href: '/production',
              permission: 'production.read',
            },
          ]}
        />,
      );
    }
    const i = data.installation;
    if (i) {
      const open = i.next7Days.filter(
        (v) => v.status !== 'COMPLETED' && v.status !== 'DONE' && v.status !== 'CANCELLED',
      ).length;
      const next =
        i.unscheduled > 0
          ? `${i.unscheduled} ${plural(i.unscheduled, 'posao čeka', 'posla čekaju', 'poslova čeka')} termin, ekipu i vozilo — Montaže → Sedmica.`
          : open > 0
            ? `${open} ${plural(open, 'posjeta je', 'posjete su', 'posjeta je')} pred vama u narednih 7 dana.`
            : null;
      cards.push(
        <WorkCard
          key="installation"
          title="Montaže"
          next={next}
          allClear={next === null}
          numbers={[
            {
              label: 'Narednih 7 dana',
              value: i.next7Days.length,
              href: '/installations',
              permission: 'service.read',
            },
            {
              label: 'Bez termina',
              value: i.unscheduled,
              href: '/installations',
              permission: 'service.read',
            },
          ]}
        >
          <VisitList visits={i.next7Days} />
        </WorkCard>,
      );
    }
    const a = data.accounting;
    if (a) {
      const next =
        a.fulfilledNotInvoiced > 0
          ? `${a.fulfilledNotInvoiced} ${plural(a.fulfilledNotInvoiced, 'isporučena narudžba čeka', 'isporučene narudžbe čekaju', 'isporučenih narudžbi čeka')} konačnu fakturu.`
          : a.overdueInvoices > 0
            ? `${a.overdueInvoices} ${plural(a.overdueInvoices, 'faktura je dospjela', 'fakture su dospjele', 'faktura je dospjelo')} — provjerite uplate.`
            : null;
      cards.push(
        <WorkCard
          key="accounting"
          title="Knjigovodstvo"
          next={next}
          allClear={next === null && a.openInvoices === 0}
          numbers={[
            {
              label: 'Isporučeno, nije fakturisano',
              value: a.fulfilledNotInvoiced,
              href: '/orders',
              permission: 'order.read',
            },
            {
              label: 'Otvorene fakture',
              value: a.openInvoices,
              href: '/finance',
              permission: 'finance.read',
            },
            {
              label: 'Otvoreni iznos',
              value: a.openAmount,
              href: '/finance',
              permission: 'finance.read',
              money: true,
            },
            {
              label: 'Dospjele fakture',
              value: a.overdueInvoices,
              href: '/finance',
              permission: 'finance.read',
            },
            {
              label: 'KIF stavki ovog mjeseca',
              value: a.kifThisMonth,
              href: '/vat',
              permission: 'finance.ledger.read',
            },
          ]}
        />,
      );
    }
    const m = data.management;
    if (m) {
      const decided = m.quotesWonLast30 + m.quotesLostLast30;
      const next =
        decided > 0
          ? `Stopa uspjeha ponuda (30 dana): ${Math.round((m.quotesWonLast30 / decided) * 100)}% — detalji u Analitici.`
          : null;
      cards.push(
        <WorkCard
          key="management"
          title="Uprava"
          next={next}
          allClear={false}
          numbers={[
            {
              label: 'Prihod ovog mjeseca',
              value: m.revenueThisMonth,
              href: '/analytics',
              permission: 'analytics.read',
              money: true,
            },
            {
              label: 'Vrijednost otvorenih narudžbi',
              value: m.openOrdersValue,
              href: '/orders',
              permission: 'order.read',
              money: true,
            },
            {
              label: 'Dobijene ponude (30 d)',
              value: m.quotesWonLast30,
              href: '/quotes',
              permission: 'quote.read',
            },
            {
              label: 'Izgubljene ponude (30 d)',
              value: m.quotesLostLast30,
              href: '/quotes',
              permission: 'quote.read',
            },
            {
              label: 'Završene montaže (sedmica)',
              value: m.installationsDoneThisWeek,
              href: '/installations',
              permission: 'service.read',
            },
          ]}
        />,
      );
    }
    body =
      cards.length > 0 ? (
        <div className="work-grid">{cards}</div>
      ) : (
        <EmptyState text="Vaša uloga trenutno nema radni pregled. Zadaci i obavještenja su ispod; za dodatna prava obratite se administratoru." />
      );
  }

  return (
    <section aria-label="Moj posao danas" style={{ marginBottom: 24 }}>
      <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ margin: 0 }}>
          Brojevi vode tamo gdje se posao radi.
          {data ? (
            <>
              {' '}
              Stanje u{' '}
              {new Date(data.generatedAt).toLocaleTimeString('bs-BA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </>
          ) : null}
        </p>
        {guideLink}
      </div>
      {body}
    </section>
  );
}
