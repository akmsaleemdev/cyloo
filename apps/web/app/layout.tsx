import type { Metadata } from 'next';
import '@crm/ui/tokens.css';

export const metadata: Metadata = {
  title: 'GCC-CRM — AI business platform',
  description: 'Multi-tenant AI CRM and omnichannel engagement for the GCC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
