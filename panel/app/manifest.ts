import type { MetadataRoute } from 'next';

/**
 * Permite instalar el panel en el celular (pantalla de inicio). A propósito NO hay service worker
 * ni caché sin conexión: el barbero nunca debe ver una agenda vieja.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Turnoo',
    short_name: 'Turnoo',
    description: 'Agenda y citas de tu barbería',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f7f9',
    theme_color: '#075985',
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
