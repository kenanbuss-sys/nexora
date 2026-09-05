'use client';

import { useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface RowResult {
  row: number;
  status: 'CREATED' | 'SKIPPED' | 'ERROR';
  message: string;
}

interface ImportReport {
  entity: string;
  total: number;
  created: number;
  skipped: number;
  errors: number;
  results: RowResult[];
}

interface EntityDef {
  key: string;
  label: string;
  importPath: string;
  exportPath: string;
  importPermission: string;
  exportPermission: string;
  columns: string;
  example: string;
}

const ENTITIES: EntityDef[] = [
  {
    key: 'products',
    label: 'Products',
    importPath: '/data/import/products',
    exportPath: '/data/export/products',
    importPermission: 'product.manage',
    exportPermission: 'product.read',
    columns: 'code, name, description',
    example: 'code,name,description\nCHAIR-01,Office chair,Ergonomic chair',
  },
  {
    key: 'skus',
    label: 'SKUs',
    importPath: '/data/import/skus',
    exportPath: '/data/export/skus',
    importPermission: 'product.manage',
    exportPermission: 'product.read',
    columns: 'productCode, code, name, baseUom, activate',
    example: 'productCode,code,name,baseUom,activate\nCHAIR-01,CHAIR-01-BLK,Black,pcs,yes',
  },
  {
    key: 'customers',
    label: 'Customers',
    importPath: '/data/import/customers',
    exportPath: '/data/export/customers',
    importPermission: 'crm.manage',
    exportPermission: 'crm.read',
    columns: 'name, email, creditLimit',
    example: 'name,email,creditLimit\nPrimjer d.o.o.,info@primjer.example,10000',
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    importPath: '/data/import/suppliers',
    exportPath: '/data/export/suppliers',
    importPermission: 'purchase.manage',
    exportPermission: 'purchase.read',
    columns: 'name, email, leadTimeDays',
    example: 'name,email,leadTimeDays\nDobavljač d.o.o.,nabava@dobavljac.example,7',
  },
  {
    key: 'stock',
    label: 'Opening stock',
    importPath: '/data/import/stock',
    exportPath: '/data/export/stock',
    importPermission: 'inventory.adjust',
    exportPermission: 'inventory.read',
    columns: 'warehouseCode, skuCode, quantity',
    example: 'warehouseCode,skuCode,quantity\nWH1,CHAIR-01-BLK,25',
  },
];

const STATUS_BADGE: Record<RowResult['status'], string> = {
  CREATED: 'badge-ok',
  SKIPPED: 'badge-warn',
  ERROR: 'badge-danger',
};

export default function DataPage() {
  const { can } = useApp();
  const [entityKey, setEntityKey] = useState('products');
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entity = ENTITIES.find((e) => e.key === entityKey)!;
  const importable = ENTITIES.filter((d) => can(d.importPermission));
  const exportable = ENTITIES.filter((d) => can(d.exportPermission));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await api<ImportReport>('POST', entity.importPath, { csv }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function runExport(def: EntityDef) {
    setError(null);
    try {
      const result = await api<{ fileName: string; csv: string }>('GET', def.exportPath);
      const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="page">
      <h1>Import/export</h1>
      <p className="page-sub">
        Load your real products, customers, suppliers and opening stock from CSV files — re-running
        the same file never duplicates data. Export the same entities any time.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      {importable.length > 0 && (
        <div className="card">
          <h2>Import from CSV</h2>
          <div className="row">
            <select
              className="select"
              value={entityKey}
              onChange={(e) => {
                setEntityKey(e.target.value);
                setReport(null);
              }}
            >
              {importable.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          <p className="muted">
            Expected columns: <span className="mono">{entity.columns}</span>
          </p>
          <textarea
            className="input mono"
            rows={8}
            value={csv}
            placeholder={entity.example}
            onChange={(e) => setCsv(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              disabled={busy || csv.trim().length === 0}
              onClick={runImport}
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="card">
          <h2>Import report</h2>
          <div className="row">
            <span className="badge badge-ok">{report.created} created</span>
            <span className="badge badge-warn">{report.skipped} skipped</span>
            <span className={`badge ${report.errors > 0 ? 'badge-danger' : ''}`}>
              {report.errors} errors
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((r) => (
                  <tr key={r.row}>
                    <td className="mono">{r.row}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    </td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {exportable.length > 0 && (
        <div className="card">
          <h2>Export to CSV</h2>
          <p className="muted">Download the current data as CSV files.</p>
          <div className="row">
            {exportable.map((d) => (
              <button key={d.key} className="btn btn-sm" onClick={() => runExport(d)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
