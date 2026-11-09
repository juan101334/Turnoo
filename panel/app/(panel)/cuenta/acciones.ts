'use server';

import { pedir, texto, type EstadoFormulario } from '@/lib/acciones';
import { CLAVE_MAX, CLAVE_MIN } from '@/lib/claves';

/**
 * Cambiar la propia contraseña con la actual. El backend cierra las demás sesiones de la persona
 * (otros celulares o PC) y anula los enlaces de contraseña pendientes; esta sesión sigue abierta.
 */
export async function cambiarContrasena(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const actual = texto(datos, 'actual');
  const nueva = texto(datos, 'nueva');
  if (!actual) return { error: 'Escribe tu contraseña actual.' };
  if (nueva.length < CLAVE_MIN || nueva.length > CLAVE_MAX) return { error: `La contraseña nueva debe tener entre ${CLAVE_MIN} y ${CLAVE_MAX} caracteres.` };
  if (nueva !== texto(datos, 'confirmacion')) return { error: 'Las dos contraseñas nuevas no coinciden.' };
  const r = await pedir('/auth/contrasena', 'POST', { actual, nueva });
  if ('error' in r) return r;
  return { listo: 'Contraseña cambiada. Se cerró tu sesión en los demás dispositivos.' };
}
