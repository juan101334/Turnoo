import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITIO } from '@/lib/sitio';
import { cuerpo, titulares } from './fuentes';
import './globals.css';

const TITULO = 'Turnoo · Tu barbería agenda sola por WhatsApp';
const DESCRIPCION =
  'Tus clientes escriben al WhatsApp de la barbería y un asistente con IA les da turno, les recuerda la cita y te avisa cuando hace falta una persona. Pruébalo 15 días.';

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', siteName: 'Turnoo', locale: 'es_CO', title: TITULO, description: DESCRIPCION },
  twitter: { card: 'summary_large_image', title: TITULO, description: DESCRIPCION },
};

export const viewport: Viewport = { themeColor: '#faf6ef', colorScheme: 'light' };

export default function Raiz({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO" className={`${titulares.variable} ${cuerpo.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
