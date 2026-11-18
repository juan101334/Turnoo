import type { NextConfig } from 'next';

const configuracion: NextConfig = {
  // Sitio estático: `npm run build` deja todo en out/ y lo sirve Caddy, sin servidor de Node.
  output: 'export',
  // Sin servidor no hay optimizador de imágenes: las capturas ya van en su tamaño final.
  images: { unoptimized: true },
  poweredByHeader: false,
  devIndicators: false,
};

export default configuracion;
