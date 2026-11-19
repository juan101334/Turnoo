import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_DESARROLLO, COOKIE_PRODUCCION } from './lib/cookie';
import { politicaDeContenido } from './lib/cabeceras';

/** Pantallas que piden sesión. Sin cookie, directo al login (ver abajo). */
const CON_SESION = [
  '/hoy',
  '/agenda',
  '/citas',
  '/por-aprobar',
  '/mensajes',
  '/bloqueos',
  '/clientes',
  '/equipo',
  '/usuarios',
  '/conocimiento',
  '/plan',
  '/negocio',
  '/cuenta',
  '/mas',
  '/superadmin',
];

const pideSesion = (camino: string) => CON_SESION.some((ruta) => camino === ruta || camino.startsWith(`${ruta}/`));

/**
 * Dos cosas antes de pintar:
 *  1. Revisión rápida: sin cookie de sesión, directo al login. Es solo una comodidad; la revisión
 *     que cuenta la hace cada página con el backend (lib/sesion.ts).
 *  2. Content-Security-Policy con un nonce nuevo en cada petición. Next lo lee de la cabecera de la
 *     petición y se lo pone a sus propios scripts; un script inyectado no lo tiene y no corre. Por
 *     eso todas las páginas se arman en cada petición (el layout raíz lee la cookie del tema).
 */
export function proxy(request: NextRequest) {
  const tieneCookie = request.cookies.has(COOKIE_PRODUCCION) || request.cookies.has(COOKIE_DESARROLLO);
  if (!tieneCookie && pideSesion(request.nextUrl.pathname)) return NextResponse.redirect(new URL('/login', request.url));

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = politicaDeContenido(nonce, process.env.NODE_ENV === 'development');
  const cabeceras = new Headers(request.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('Content-Security-Policy', csp);
  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set('Content-Security-Policy', csp);
  return respuesta;
}

export const config = {
  matcher: [
    {
      // Todo menos los archivos estáticos (no ejecutan nada) y las precargas de next/link.
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|marca/|iconos/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
