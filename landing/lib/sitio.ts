/** Datos del sitio que se repiten: dirección, WhatsApp y planes. */

export const SITIO = 'https://turnooapp.com';
/**
 * Dirección del panel (login), en NEXT_PUBLIC_PANEL_URL. Sin ella, la de producción. Si viene mal
 * escrita, la landing no compila, igual que con el WhatsApp.
 */
function direccionDelPanel(): string {
  const valor = process.env.NEXT_PUBLIC_PANEL_URL?.trim() || 'https://app.turnooapp.com';
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`NEXT_PUBLIC_PANEL_URL no es una dirección válida: "${valor}" (ej. https://app.turnooapp.com)`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('NEXT_PUBLIC_PANEL_URL debe empezar por https:// (o http:// en tu equipo)');
  return url.origin;
}
export const PANEL = direccionDelPanel();
export const DIAS_DE_PRUEBA = 15;

/**
 * El número llega en NEXT_PUBLIC_WHATSAPP, en formato internacional ("+57 300 123 4567"). wa.me
 * lo pide solo con dígitos. Sin él o mal escrito, la landing no compila: mejor enterarse al
 * construir que publicar un botón que no lleva a nadie. (Misma regla que panel/lib/soporte.ts.)
 */
function numeroDeWhatsapp(): string {
  const digitos = (process.env.NEXT_PUBLIC_WHATSAPP ?? '')
    .trim()
    .replace(/[\s().-]/g, '')
    .replace(/^\+/, '');
  if (!/^[1-9]\d{7,14}$/.test(digitos)) {
    throw new Error('NEXT_PUBLIC_WHATSAPP debe ser un número en formato internacional, ej. +57 300 123 4567 (revisa landing/.env.local)');
  }
  return digitos;
}

/** Enlace que abre WhatsApp con el mensaje ya escrito. */
export function enlaceDeWhatsapp(mensaje = `Hola, quiero probar Turnoo ${DIAS_DE_PRUEBA} días en mi barbería.`): string {
  return `https://wa.me/${numeroDeWhatsapp()}?text=${encodeURIComponent(mensaje)}`;
}

export interface Plan {
  nombre: string;
  /** Pesos colombianos al mes. */
  precio: number;
  paraQuien: string;
  barberos: string;
  conversaciones: number;
  destacado?: boolean;
}

/** Los mismos valores de la tabla `planes` (db/migrations/016_planes.sql). Si cambian allá, cambian aquí. */
export const PLANES: Plan[] = [
  { nombre: 'Independiente', precio: 39900, paraQuien: 'Para quien atiende solo.', barberos: '1 barbero', conversaciones: 300 },
  { nombre: 'Barbería', precio: 89900, paraQuien: 'Para un local con equipo.', barberos: 'Hasta 4 barberos', conversaciones: 1000, destacado: true },
  { nombre: 'Pro', precio: 149900, paraQuien: 'Para locales grandes.', barberos: 'Hasta 10 barberos', conversaciones: 2500 },
];

const miles = new Intl.NumberFormat('es-CO');
export const pesos = (cop: number) => `$${miles.format(cop)}`;
export const cantidad = (n: number) => miles.format(n);
