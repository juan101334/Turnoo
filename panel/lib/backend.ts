import 'server-only';
import { headers } from 'next/headers';
import { pedirAlBackend, type Metodo } from './backend-nucleo';
import { configuracion } from './configuracion';
import { ipDelCliente } from './ip';
import { tokenDeSesion } from './token';

export { ErrorDelBackend } from './backend-nucleo';

/**
 * Llama al backend desde el servidor del panel, con el token de la cookie y la IP real del
 * usuario. `conSesion: false` para las rutas públicas (login, invitación, restablecer).
 */
export async function llamarAlBackend<T>(
  ruta: string,
  { metodo, cuerpo, conSesion = true }: { metodo?: Metodo; cuerpo?: unknown; conSesion?: boolean } = {},
): Promise<T> {
  const ipCliente = ipDelCliente((await headers()).get('x-forwarded-for'), configuracion.saltosProxy);
  const token = conSesion ? await tokenDeSesion() : null;
  return pedirAlBackend<T>(configuracion.backendUrl, ruta, { metodo, cuerpo, token, ipCliente });
}
