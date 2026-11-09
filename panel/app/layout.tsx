import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { COLOR_BARRA } from '@/lib/tema';
import { temaElegido } from '@/lib/tema-servidor';
import { plex, plexCondensada } from './fuentes';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Turnoo', template: '%s · Turnoo' },
  description: 'Agenda y citas de tu barbería',
  robots: { index: false, follow: false },
  // Instalado en el iPhone desde "Agregar a inicio": abre sin la barra de Safari.
  appleWebApp: { capable: true, title: 'Turnoo', statusBarStyle: 'default' },
};

export async function generateViewport(): Promise<Viewport> {
  const tema = await temaElegido();
  return {
    width: 'device-width',
    initialScale: 1,
    // Deja que el contenido llegue al borde y respete la muesca con env(safe-area-inset-*).
    viewportFit: 'cover',
    // La barra del navegador (y del panel instalado) toma el color del tema: el elegido, o el del sistema.
    themeColor:
      tema === 'sistema'
        ? [
            { media: '(prefers-color-scheme: light)', color: COLOR_BARRA.claro },
            { media: '(prefers-color-scheme: dark)', color: COLOR_BARRA.oscuro },
          ]
        : COLOR_BARRA[tema],
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tema = await temaElegido();
  return (
    <html lang="es" data-tema={tema === 'sistema' ? undefined : tema} className={`${plex.variable} ${plexCondensada.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
