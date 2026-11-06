import { NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import * as repositorio from './conversaciones.repositorio.js';
import type { ContextoDeConversacion, MotivoDerivacion } from './conversaciones.tipos.js';

/** Cuántos mensajes recientes lee la IA. Más mensajes cuestan más tokens en cada respuesta. */
export const MENSAJES_DEL_HISTORIAL = 30;
const MAX_DETALLE = 500;

export async function contextoDeConversacion(negocioId: string, conversacionId: string): Promise<ContextoDeConversacion> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  return conNegocio(negocioId, async (tx) => {
    const datos = await repositorio.datosDeLaConversacion(tx, conversacionId);
    if (!datos) throw new NoEncontrado('La conversación');
    return { ...datos, historial: await repositorio.historial(tx, conversacionId, MENSAJES_DEL_HISTORIAL) };
  });
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
