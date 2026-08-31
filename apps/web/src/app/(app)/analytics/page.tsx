'use client';

import { useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';

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

interface KpiDefinition {
  key: string;
  name: string;
  description: string;
  unit: string;
  domain: string;
}

interface InventoryRow {
  warehouseId: string;
  warehouseCode: string;
  movements: number;
  activeReservations: number;
}

interface ManufacturingAnalytics {
  byStatus: Record<string, number>;
  completed: number;
  goodTotal: string;
  scrapTotal: string;
  scrapRatePct: string;
  avgCycleMinutes: string;
}

interface CustomerRow {
  accountId: string;
  orders: number;
  revenue: string;
  currency: string;
}

interface AccountView {
  id: string;
  partyName: string;
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [manufacturing, setManufacturing] = useState<ManufacturingAnalytics | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ExecutiveSummary>('GET', '/api/v1/analytics/executive')
      .then(setSummary)
      .catch((e: unknown) => setError(errorText(e)));
    api<{ kpis: KpiDefinition[] }>('GET', '/api/v1/analytics/kpis')
      .then((r) => setKpis(r.kpis))
      .catch(() => undefined);
    api<{ rows: InventoryRow[] }>('GET', '/api/v1/analytics/inventory')
      .then((r) => setInventory(r.rows))
      .catch(() => undefined);
    api<ManufacturingAnalytics>('GET', '/api/v1/analytics/manufacturing')
      .then(setManufacturing)
      .catch(() => undefined);
    api<{ rows: CustomerRow[] }>('GET', '/api/v1/analytics/customers')
      .then((r) => setCustomers(r.rows))
      .catch(() => undefined);
    api<{ accounts: AccountView[] }>('GET', '/api/v1/crm/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch(() => undefined);
  }, []);

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.partyName ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Control Center</h1>
      <p className="page-sub">
        Governed KPIs computed live from the transactional source of truth — no copies, no stale
        numbers.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      {summary ? (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="card stat">
              <div className="stat-label">Invoiced revenue</div>
              <div className="stat-value">{summary.revenue}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                pipeline {summary.quotePipeline}
              </div>
            </div>
            <div className="card stat">
              <div className="stat-label">Open AR / AP</div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {summary.openReceivables} / {summary.openPayables}
              </div>
            </div>
            <div className="card stat">
              <div className="stat-label">Open orders · WIP</div>
              <div className="stat-value">
                {summary.openOrders} · {summary.wipOrders}
              </div>
            </div>
            <div className="card stat">
              <div className="stat-label">Scrap rate · open NCRs</div>
              <div className="stat-value">
                {summary.scrapRatePct}% · {summary.openNcrs}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="loading">Loading control center…</div>
      )}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Top customers</h2>
            {customers.length === 0 ? (
              <div className="empty">No orders yet.</div>
            ) : (
              <table className="table">
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.accountId}>
                      <td>{accountName(c.accountId)}</td>
                      <td>{c.orders} order(s)</td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {c.revenue} {c.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Warehouse activity</h2>
            {inventory.length === 0 ? (
              <div className="empty">No warehouses yet.</div>
            ) : (
              <table className="table">
                <tbody>
                  {inventory.map((w) => (
                    <tr key={w.warehouseId}>
                      <td className="mono">{w.warehouseCode}</td>
                      <td>{w.movements} ledger movement(s)</td>
                      <td style={{ textAlign: 'right' }}>
                        {w.activeReservations} active reservation(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          {manufacturing ? (
            <div className="card">
              <h2>Manufacturing</h2>
              <table className="table">
                <tbody>
                  {Object.entries(manufacturing.byStatus).map(([status, count]) => (
                    <tr key={status}>
                      <td>{status.replace('_', ' ')}</td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {count}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>Good / scrap produced</td>
                    <td style={{ textAlign: 'right' }} className="mono">
                      {manufacturing.goodTotal} / {manufacturing.scrapTotal}
                    </td>
                  </tr>
                  <tr>
                    <td>Average cycle</td>
                    <td style={{ textAlign: 'right' }} className="mono">
                      {manufacturing.avgCycleMinutes} min
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="card">
            <h2>KPI catalog</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Governed definitions — every number above traces to one of these.
            </p>
            <table className="table">
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.key}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {k.key}
                    </td>
                    <td>
                      {k.name}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {k.description}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge">{k.domain}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
