'use client';

import type { ReactNode } from 'react';
import { ApiRequestError, errorText } from '../../../lib/api';

/** HCM-017 (Sprint 237) — shared view types and helpers for /development. */

export interface Level {
  key: string;
  label: string;
}

export interface DevSettings {
  qualificationLevels: Level[];
  itemStatuses: Record<string, string>;
  closedStatuses: string[];
}

export interface TemplateView {
  key: string;
  version: number;
  name: string;
  qualificationLevel: string | null;
  items: Array<{ key: string; text: string }>;
}

/**
 * API error text. A 403 names the missing development permission in the
 * server message — shown as-is so the person knows what to ask for.
 */
export function devErrorText(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 403 || e.body.code === 'FORBIDDEN')) {
    return `Nemate pravo za ovu radnju: ${e.body.message}`;
  }
  return errorText(e);
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
