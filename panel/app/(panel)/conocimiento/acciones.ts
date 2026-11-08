'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { pedir, texto, type EstadoFormulario } from '@/lib/acciones';
import { MAX_PREGUNTA, MAX_RESPUESTA } from '@/lib/conocimiento';
import { esId } from '@/lib/datos';

/** Base de conocimiento: lo que el asistente dice en nombre del negocio. Solo el dueño. */

function entradaDelFormulario(datos: FormData): { pregunta: string; respuesta: string } | { error: string } {
  const pregunta = texto(datos, 'pregunta');
  const respuesta = texto(datos, 'respuesta');
  if (!pregunta) return { error: 'Escribe la pregunta.' };
  if (!respuesta) return { error: 'Escribe la respuesta.' };
  if (pregunta.length > MAX_PREGUNTA) return { error: `La pregunta no puede pasar de ${MAX_PREGUNTA} caracteres.` };
  if (respuesta.length > MAX_RESPUESTA) return { error: `La respuesta no puede pasar de ${MAX_RESPUESTA} caracteres.` };
  return { pregunta, respuesta };
}

export async function crearEntrada(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const entrada = entradaDelFormulario(datos);
  if ('error' in entrada) return entrada;
  const r = await pedir('/conocimiento', 'POST', entrada);
  if ('error' in r) return r;
  revalidatePath('/conocimiento');
  return { listo: 'Pregunta agregada. El asistente ya la usa.' };
}

export async function editarEntrada(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(id)) return { error: 'Entrada no válida.' };
  const entrada = entradaDelFormulario(datos);
  if ('error' in entrada) return entrada;
  const r = await pedir(`/conocimiento/${id}`, 'PATCH', { ...entrada, activo: datos.get('activo') === 'si' });
  if ('error' in r) return r;
  revalidatePath('/conocimiento');
  redirect('/conocimiento?listo=editada');
}

/** Pausar: el asistente deja de usarla, sin borrarla. */
export async function cambiarEntradaActiva(id: string, activo: boolean): Promise<EstadoFormulario> {
  if (!esId(id)) return { error: 'Entrada no válida.' };
  const r = await pedir(`/conocimiento/${id}`, 'PATCH', { activo });
  if ('error' in r) return r;
  revalidatePath('/conocimiento');
  return {};
}

export async function borrarEntrada(id: string): Promise<EstadoFormulario> {
  if (!esId(id)) return { error: 'Entrada no válida.' };
  const r = await pedir(`/conocimiento/${id}`, 'DELETE');
  if ('error' in r) return r;
  revalidatePath('/conocimiento');
  return {};
}
