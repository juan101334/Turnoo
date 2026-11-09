import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google';

/**
 * Fuentes del panel. next/font las descarga al compilar y las sirve el propio panel: el navegador
 * nunca llama a Google. Solo caracteres latinos y los pesos que se usan.
 */
export const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--fuente-plex',
});

/** Para horas y precios grandes: más estrecha, cabe "10:30 a. m." en poco ancho. */
export const plexCondensada = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--fuente-plex-condensada',
});
