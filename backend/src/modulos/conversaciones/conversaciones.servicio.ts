import { NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import * as repositorio from './conversaciones.repositorio.js';
import type { ContextoDeConversacion, MotivoDerivacion, PasoDeIA } from './conversaciones.tipos.js';

/** Cuántos mensajes recientes lee la IA. Más mensajes cuestan más tokens en cada respuesta. */
export const MENSAJES_DEL_HISTORIAL = 30;
/** Cuántas funciones anteriores ve la IA. Cada resultado son tokens en cada respuesta. */
export const PASOS_DEL_HISTORIAL = 20;
const MAX_DETALLE = 500;

export async function contextoDeConversacion(negocioId: string, conversacionId: string): Promise<ContextoDeConversacion> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  return conNegocio(negocioId, async (tx) => {
    const datos = await repositorio.datosDeLaConversacion(tx, conversacionId);
    if (!datos) throw new NoEncontrado('La conversación');
    const historial = await repositorio.historial(tx, conversacionId, MENSAJES_DEL_HISTORIAL);
    // Solo las funciones de la parte de la conversación que la IA alcanza a leer.
    const pasos = historial[0]
      ? await repositorio.pasosDesde(tx, conversacionId, historial[0].creadoEn, PASOS_DEL_HISTORIAL)
      : [];
    return { ...datos, historial, pasos };
  });
}

/** Guarda las funciones que usó la IA en una respuesta, para que las vea en los turnos siguientes. */
export async function guardarPasosDeIA(
  negocioId: string,
  conversacionId: string,
  pasos: Omit<PasoDeIA, 'creadoEn' | 'orden'>[],
  ahora: Date,
): Promise<void> {
  if (pasos.length === 0) return;
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  await conNegocio(negocioId, (tx) => repositorio.guardarPasos(tx, negocioId, conversacionId, pasos, ahora));
}

/**
 * Pasa la conversación a una persona del negocio. `detalle` es lo que pidió el cliente, para
 * completar después la base de conocimiento. El aviso al dueño llega con las plantillas.
 */
export async function derivarConversacion(
  negocioId: string,
  conversacionId: string,
  motivo: MotivoDerivacion,
  detalle: string | null,
  ahora: Date = new Date(),
): Promise<void> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  const limpio = detalle?.replaceAll('\u0000', '').trim().slice(0, MAX_DETALLE) || null;
  await conNegocio(negocioId, async (tx) => {
    if (!(await repositorio.datosDeLaConversacion(tx, conversacionId))) throw new NoEncontrado('La conversación');
    await repositorio.derivar(tx, { negocioId, conversacionId, motivo, detalle: limpio, ahora });
  });
}
