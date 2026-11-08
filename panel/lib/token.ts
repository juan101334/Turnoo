import 'server-only';
import { cookies } from 'next/headers';
import { configuracion } from './configuracion';
import { nombreCookie } from './cookie';

export const NOMBRE_COOKIE = nombreCookie(configuracion.produccion);

/** Token de la sesión, leído de la cookie HttpOnly. Solo existe en el servidor del panel. */
export async function tokenDeSesion(): Promise<string | null> {
  return (await cookies()).get(NOMBRE_COOKIE)?.value ?? null;
}
