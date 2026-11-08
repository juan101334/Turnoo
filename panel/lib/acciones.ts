import 'server-only';
import { redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from './backend';
import type { Metodo } from './backend-nucleo';

/**
 * Lo común de las Server Actions. Son endpoints públicos (cualquiera puede hacerles un POST), así
 * que validan lo que reciben antes de armar la ruta; los permisos los decide el backend.
 */

/** Resultado de un formulario: un error para mostrar o un mensaje de éxito. */
export interface EstadoFormulario {
  error?: string;
  listo?: string;
}

/** El texto de un campo, sin espacios a los lados ('' si no vino). */
export function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Llama al backend; un error conocido vuelve como mensaje. Sin sesión, al login. */
export async function pedir<T = unknown>(ruta: string, metodo: Metodo, cuerpo?: unknown): Promise<{ ok: T } | { error: string }> {
  try {
    return { ok: await llamarAlBackend<T>(ruta, { metodo, ...(cuerpo !== undefined && { cuerpo }) }) };
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    if (error.estado === 401) redirect('/sesion-vencida');
    return { error: error.message };
  }
}
