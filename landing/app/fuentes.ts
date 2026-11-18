import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';

/**
 * next/font descarga las fuentes al compilar y las deja dentro del sitio: el navegador nunca
 * llama a Google. Titulares en Bricolage Grotesque; el cuerpo en IBM Plex Sans, como el panel.
 */
export const titulares = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '800'],
  display: 'swap',
  variable: '--fuente-titulares',
});

export const cuerpo = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--fuente-cuerpo',
});
