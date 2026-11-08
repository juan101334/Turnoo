import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { ErrorDelBackend, llamarAlBackend } from './backend';
import { configuracion } from './configuracion';
import { puedeVer, rutaDeInicio, type ClaveSeccion, type Rol } from './navegacion';
import { NOMBRE_COOKIE as NOMBRE, tokenDeSesion } from './token';

export { tokenDeSesion };

/**
 * La sesión vive en una cookie HttpOnly: el JavaScript del navegador no puede leerla, y nunca va
 * en la URL ni en localStorage. SameSite=Lax impide que otro sitio la use en un POST (CSRF);
 * las Server Actions, además, rechazan peticiones cuyo Origin no coincide con el panel.
 */

export interface Usuario {
  usuarioId: string;
  negocioId: string | null;
  rol: Rol;
  nombre: string;
}

/** Solo en Server Actions o Route Handlers: Next no deja escribir cookies al pintar una página. */
export async function guardarSesion(token: string, expiraEn: Date): Promise<void> {
  (await cookies()).set(NOMBRE, token, {
    httpOnly: true,
    secure: configuracion.produccion,
    sameSite: 'lax',
    path: '/',
    expires: expiraEn,
  });
}

export async function borrarSesion(): Promise<void> {
  (await cookies()).delete({ name: NOMBRE, path: '/', secure: configuracion.produccion, httpOnly: true, sameSite: 'lax' });
}

/** El usuario de la cookie, preguntándole al backend. Null si no hay sesión o ya no vale. Una vez por petición. */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  if (!(await tokenDeSesion())) return null;
  try {
    return (await llamarAlBackend<{ usuario: Usuario }>('/auth/yo')).usuario;
  } catch (error) {
    if (error instanceof ErrorDelBackend && error.estado === 401) return null;
    throw error;
  }
});

/**
 * Exige sesión para ver una página. Sin cookie, al login; con una cookie que ya no vale, a
 * /sesion-vencida, que la borra. Si la sección no es de su rol, responde como si no existiera.
 */
export async function exigirUsuario(seccion?: ClaveSeccion): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect((await tokenDeSesion()) ? '/sesion-vencida' : '/login');
  if (usuario.rol === 'superadmin') redirect(rutaDeInicio('superadmin'));
  if (seccion && !puedeVer(usuario.rol, seccion)) notFound();
  return usuario;
}
