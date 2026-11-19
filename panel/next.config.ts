import type { NextConfig } from 'next';
import { HSTS, POLITICA_DE_PERMISOS } from './lib/cabeceras';

const configuracion: NextConfig = {
  // Imagen de Docker pequeña: solo lo necesario para `node server.js`.
  output: 'standalone',
  // Las pruebas de punta a punta usan su propia carpeta: así corren aunque tengas `npm run dev` abierto.
  distDir: process.env.PANEL_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Sin el botón "N" de Next en desarrollo: tapaba "Cuenta" en el PC y "Hoy" en el celular.
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: HSTS },
          { key: 'Permissions-Policy', value: POLITICA_DE_PERMISOS },
          // La Content-Security-Policy va en proxy.ts: lleva un nonce distinto en cada petición.
        ],
      },
    ];
  },
};

export default configuracion;
