/**
 * Cabeceras de seguridad del panel. Las fijas van en next.config.ts; la CSP lleva un nonce por
 * petición y la pone proxy.ts.
 */

/**
 * Content-Security-Policy. Scripts: solo los que traen el nonce, y lo que esos carguen
 * ('strict-dynamic'); sin 'unsafe-eval' en producción (React lo usa solo en desarrollo, para
 * mostrar mejor los errores). Estilos: 'unsafe-inline' porque los componentes usan style={}, que
 * no puede llevar nonce; un estilo no ejecuta código. Todo lo demás, del mismo sitio.
 */
export function politicaDeContenido(nonce: string, desarrollo: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Funciones del navegador que el panel no usa: apagadas, también para lo que se cuele. */
export const POLITICA_DE_PERMISOS = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'hid=()',
  'midi=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'display-capture=()',
  'browsing-topics=()',
].join(', ');

/** HTTPS obligatorio por un año, también en los subdominios. El navegador lo ignora en http://localhost. */
export const HSTS = 'max-age=31536000; includeSubDomains';
