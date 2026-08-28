import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The visible product name is tenant-configurable at runtime (white-label);
// this default title is platform-neutral scaffolding, not branding.
export const metadata: Metadata = {
  title: 'Enterprise Business OS',
  description: 'Modular, multi-tenant, white-label enterprise business operating system',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>{children}</body>
    </html>
  );
}
