import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Turnoo', template: '%s · Turnoo' },
  description: 'Agenda y citas de tu barbería',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deja que el contenido llegue al borde y respete la muesca con env(safe-area-inset-*).
  viewportFit: 'cover',
  themeColor: '#0369a1',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
