import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_DESARROLLO, COOKIE_PRODUCCION } from './lib/cookie';

/**
 * Revisión rápida, antes de pintar: sin cookie de sesión, directo al login. Es solo una
 * comodidad; la revisión que cuenta la hace cada página con el backend (lib/sesion.ts).
 */
export function proxy(request: NextRequest) {
  const tieneCookie = request.cookies.has(COOKIE_PRODUCCION) || request.cookies.has(COOKIE_DESARROLLO);
  if (!tieneCookie) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/hoy/:path*',
    '/agenda/:path*',
    '/por-aprobar/:path*',
    '/mensajes/:path*',
    '/bloqueos/:path*',
    '/clientes/:path*',
    '/equipo/:path*',
    '/usuarios/:path*',
    '/conocimiento/:path*',
    '/plan/:path*',
    '/negocio/:path*',
    '/cuenta/:path*',
    '/mas/:path*',
    '/superadmin/:path*',
  ],
};
