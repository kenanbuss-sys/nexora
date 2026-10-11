import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Public QR lookup (Sprint 238, EAM-016) — OUTSIDE the authenticated app
 * shell: no session, no app navigation. Not indexed by search engines.
 */
export const metadata: Metadata = {
  title: 'Provjera oznake',
  robots: { index: false, follow: false },
};

export default function PublicQrLayout({ children }: { children: ReactNode }) {
  return children;
}
