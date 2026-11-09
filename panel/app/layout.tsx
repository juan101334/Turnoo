import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { plex, plexCondensada } from './fuentes';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Turnoo', template: '%s · Turnoo' },
  description: 'Agenda y citas de tu barbería',
  robots: { index: false, follow: false },
  // Instalado en el iPhone desde "Agregar a inicio": abre sin la barra de Safari.
  appleWebApp: { capable: true, title: 'Turnoo', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deja que el contenido llegue al borde y respete la muesca con env(safe-area-inset-*).
  viewportFit: 'cover',
  // La barra del navegador (y del panel instalado) toma el color del modo del sistema.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#075985' },
    { media: '(prefers-color-scheme: dark)', color: '#0b141d' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${plex.variable} ${plexCondensada.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
