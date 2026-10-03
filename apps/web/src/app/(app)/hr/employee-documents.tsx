'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { hcmErrorText } from './contracts';

/**
 * HCM-016 (Sprint 236) — private employee documents. Visible only with
 * hcm.docs.read, uploads with hcm.docs.manage; the server enforces both,
 * rejects HTML/scripts and audits every download. Files are never
 * rendered inline — they are only handed to the browser as downloads.
 */

interface EmployeeDocument {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function EmployeeDocuments({
  employeeId,
  canRead,
  canManage,
}: {
  employeeId: string;
  canRead: boolean;
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!canRead) return;
    setDocuments(null);
    api<{ documents: EmployeeDocument[] }>('GET', `/api/v1/hcm/employees/${employeeId}/documents`)
      .then((r) => {
        setDocuments(r.documents);
        setError(null);
      })
      .catch((e: unknown) => {
        setDocuments([]);
        setError(hcmErrorText(e));
      });
  }, [canRead, employeeId]);

  useEffect(() => {
    setNotice(null);
    load();
  }, [load]);

  const upload = (file: File) => {
    setNotice(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `Dokument je veći od 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB) — smanjite datoteku pa pokušajte ponovo.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = String(reader.result).split(',')[1] ?? '';
      setBusy(true);
      setError(null);
      api('POST', `/api/v1/hcm/employees/${employeeId}/documents`, {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        dataBase64,
      })
        .then(() => {
          setNotice('Dokument je dodat u dosije radnika.');
          load();
        })
        .catch((e: unknown) => setError(hcmErrorText(e)))
        .finally(() => setBusy(false));
    };
    reader.onerror = () => setError('Datoteku nije moguće pročitati.');
    reader.readAsDataURL(file);
  };

  const download = (doc: EmployeeDocument) => {
    setError(null);
    void api<{ fileName: string; contentType: string; dataBase64: string }>(
      'GET',
      `/api/v1/hcm/documents/${doc.id}`,
    )
      .then((r) => {
        const bytes = Uint8Array.from(atob(r.dataBase64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
        const a = document.createElement('a');
        a.href = url;
        a.download = r.fileName;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e: unknown) => setError(hcmErrorText(e)));
  };

  return (
    <>
      <h3 style={{ marginTop: 16, marginBottom: 6 }}>Dokumenti radnika</h3>
      {!canRead ? (
        <EmptyState text="Dokumenti radnika vidljivi su samo uz pravo hcm.docs.read." />
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            Povjerljivo. Svako preuzimanje se evidentira.
          </p>
          {error ? <ErrorState text={error} /> : null}
          {notice ? <div className="alert alert-ok">{notice}</div> : null}
          {canManage ? (
            <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
              <label className="btn btn-sm" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Slanje…' : 'Dodaj dokument'}
                <input
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) upload(file);
                  }}
                />
              </label>
              <span className="muted" style={{ fontSize: 12 }}>
                Najviše 5 MB; HTML i skripte se odbijaju.
              </span>
            </div>
          ) : null}
          {documents === null ? (
            <LoadingState text="Učitavanje dokumenata…" />
          ) : documents.length === 0 ? (
            error ? null : (
              <EmptyState text="Radnik još nema dokumenata." />
            )
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Naziv</th>
                  <th>Veličina</th>
                  <th>Dodat</th>
                  <th style={{ textAlign: 'right' }} aria-label="Akcije" />
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td style={{ overflowWrap: 'anywhere' }}>{d.fileName}</td>
                    <td className="mono">{fmtSize(d.sizeBytes)}</td>
                    <td className="mono">{d.createdAt.slice(0, 10)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-sm" onClick={() => download(d)}>
                        Preuzmi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
