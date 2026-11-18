'use server';

import { revalidatePath } from 'next/cache';
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

/** Los mismos límites que el backend (PATCH /auth/yo): de 2 a 100 caracteres, sin espacios de más. */
const NOMBRE_MIN = 2;
const NOMBRE_MAX = 100;

/**
 * Cambiar el nombre de la propia cuenta. No lleva id: el backend cambia el de la sesión. El nombre
 * del barbero (el que ven los clientes) no cambia: ese lo decide el dueño en Barberos y servicios.
 */
export async function cambiarNombre(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const nombre = texto(datos, 'nombre').replace(/\s+/g, ' ');
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) return { error: `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.` };
  const r = await pedir('/auth/yo', 'PATCH', { nombre });
  if ('error' in r) return r;
  // El nombre sale también en el menú: se pinta todo otra vez.
  revalidatePath('/', 'layout');
  return { listo: 'Nombre guardado.' };
}

/** Cerrar la sesión en los demás celulares y computadores. Esta sigue abierta. */
export async function cerrarOtrasSesiones(): Promise<EstadoFormulario> {
  const r = await pedir<{ cerradas: number }>('/auth/sesiones/cerrar-otras', 'POST');
  if ('error' in r) return r;
  const n = r.ok.cerradas;
  if (n === 0) return { listo: 'No había sesiones abiertas en otros dispositivos.' };
  return { listo: n === 1 ? 'Se cerró la sesión en 1 dispositivo.' : `Se cerró la sesión en ${n} dispositivos.` };
}
