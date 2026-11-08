'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from '@/lib/backend';
import { esId } from '@/lib/datos';
import type { EstadoAccion } from '../citas/acciones';

/**
 * Cambios a un cliente. Solo el dueño los ve en el panel, pero estas acciones se pueden llamar con
 * un POST cualquiera: quien decide que solo el dueño puede es el backend (responde 403).
 */

const texto = (datos: FormData, campo: string) => {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
};

async function pedir(ruta: string, cuerpo: unknown): Promise<{ error?: string }> {
  try {
    await llamarAlBackend(ruta, { metodo: ruta.endsWith('/anonimizar') ? 'POST' : 'PATCH', cuerpo });
    return {};
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    if (error.estado === 401) redirect('/sesion-vencida');
    return { error: error.message };
  }
}

export async function editarCliente(clienteId: string, _previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  if (!esId(clienteId)) return { error: 'Cliente no válido.' };
  const telefono = texto(datos, 'telefono');
  if (!telefono) return { error: 'Escribe el teléfono del cliente.' };
  // Vacío = borrar el dato (el backend guarda null). Los largos máximos los valida el backend.
  const nombre = texto(datos, 'nombre');
  const notas = texto(datos, 'notas');
  const resultado = await pedir(`/clientes/${clienteId}`, { telefono, nombre: nombre || null, notas: notas || null });
  if (resultado.error) return resultado;
  revalidatePath('/', 'layout');
  redirect(`/clientes/${clienteId}?listo=editado`);
}

/** Borra nombre, teléfono, notas e imágenes del cliente. No se puede deshacer. */
export async function anonimizarCliente(clienteId: string): Promise<{ error?: string }> {
  if (!esId(clienteId)) return { error: 'Cliente no válido.' };
  const resultado = await pedir(`/clientes/${clienteId}/anonimizar`, {});
  if (resultado.error) return resultado;
  revalidatePath('/', 'layout');
  redirect(`/clientes/${clienteId}?listo=anonimizado`);
}
