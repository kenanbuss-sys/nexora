'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toString as qrToString } from 'qrcode';
import { api, ApiRequestError, errorText } from '../../../lib/api';

/**
 * Shared pieces of the equipment custody / QR screens (Sprint 238,
 * EAM-015/016): types, the 403 error helper, a client-side QR renderer
 * and an audited print flow. Pure presentation — every rule (who may
 * issue/return, what a public QR reveals, print audit) is server-side.
 */

export type CustodyStatus = 'OPEN' | 'PARTIALLY_RETURNED' | 'CLOSED';
export type ReturnCondition = 'OK' | 'DAMAGED' | 'LOST';

export interface CustodySummary {
  id: string;
  custodyNumber: string;
  employeeId: string;
  employeeName: string | null;
  status: CustodyStatus;
  issuedAt: string;
  items: number;
  open: number;
}

export interface CustodyLine {
  assetId: string;
  assetNumber: string;
  assetName: string;
  returnedAt: string | null;
  returnCondition: ReturnCondition | null;
  returnNote: string | null;
}

export interface CustodyDetail {
  id: string;
  custodyNumber: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  status: CustodyStatus;
  /** Null when the revers QR was revoked. */
  groupToken: string | null;
  note: string | null;
  issuedAt: string;
  lines: CustodyLine[];
}

export interface EquipmentAssetView {
  assetId: string;
  assetNumber: string;
  name: string;
  location: string | null;
  qrToken: string | null;
  custody: {
    custodyId: string;
    custodyNumber: string;
    employeeId: string;
    issuedAt: string;
  } | null;
}

export const CUSTODY_STATUS: Record<CustodyStatus, [string, string]> = {
  OPEN: ['Zaduženo', 'badge-info'],
  PARTIALLY_RETURNED: ['Djelimično vraćeno', 'badge-warn'],
  CLOSED: ['Razduženo', 'badge-ok'],
};

export const CONDITION_LABEL: Record<ReturnCondition, [string, string]> = {
  OK: ['Ispravno', 'badge-ok'],
  DAMAGED: ['Oštećeno', 'badge-warn'],
  LOST: ['Izgubljeno', 'badge-danger'],
};

/** Calendar date (YYYY-MM-DD) of an ISO timestamp. */
export const isoDay = (iso: string) => iso.slice(0, 10);

/**
 * API error text. A 403 carries the missing permission in the server
 * message — shown as-is so the person knows what to ask for.
 */
export function eamErrorText(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 403 || e.body.code === 'FORBIDDEN')) {
    return `Nemate pravo za ovu radnju: ${e.body.message}`;
  }
  return errorText(e);
}

/**
 * Renders `text` as a QR code (SVG, client-side) and returns it as a data
 * URI for an <img> — never injected as HTML. `failed` when generation
 * failed; the caller then shows the plain URL instead.
 */
export function useQrDataUri(text: string | null): { uri: string | null; failed: boolean } {
  const [state, setState] = useState<{ text: string; uri: string | null; failed: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!text) return;
    let alive = true;
    qrToString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (alive)
          setState({
            text,
            uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
            failed: false,
          });
      })
      .catch(() => {
        if (alive) setState({ text, uri: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [text]);
  if (!text || !state || state.text !== text) return { uri: null, failed: false };
  return { uri: state.uri, failed: state.failed };
}

/** QR image with the URL as a text fallback (and caption) underneath. */
export function QrImage({
  url,
  size = 148,
  caption = true,
}: {
  url: string;
  size?: number;
  caption?: boolean;
}) {
  const { uri, failed } = useQrDataUri(url);
  return (
    <div style={{ display: 'inline-block', maxWidth: '100%' }}>
      {uri ? (
        <img src={uri} width={size} height={size} alt={`QR kod: ${url}`} />
      ) : failed ? null : (
        <div className="muted" style={{ width: size, height: size, fontSize: 12 }}>
          Generisanje QR koda…
        </div>
      )}
      {caption || failed ? (
        <div
          className="mono muted"
          style={{ fontSize: 10.5, wordBreak: 'break-all', maxWidth: 260 }}
        >
          {url}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Audited print: records the print on the server FIRST (print-log), then
 * mounts the print-only content at the body level and opens the browser
 * print dialog. A failed audit call blocks the print.
 */
export function usePrint() {
  const [content, setContent] = useState<ReactNode>(null);

  useEffect(() => {
    if (content === null) return;
    // Let the portal (and its data-URI QR image) render before printing.
    const t = window.setTimeout(() => {
      window.print();
      setContent(null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [content]);

  async function print(
    log: { custodyId: string } | { assetId: string },
    kind: 'REVERS' | 'LABEL' | 'LIST',
    node: ReactNode,
  ) {
    await api('POST', '/api/v1/equipment/print-log', { ...log, kind });
    setContent(node);
  }

  const portal =
    content !== null && typeof document !== 'undefined'
      ? createPortal(<div className="print-area">{content}</div>, document.body)
      : null;

  return { print, portal, printing: content !== null };
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
