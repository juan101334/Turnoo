import { NoEncontrado } from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import { exigirNegocioOperativo } from '../negocios/negocios.reglas.js';
import { enviarMensaje, type DependenciasEnvio } from '../whatsapp/whatsapp.envio.js';
import type { ResultadoEnvio } from '../whatsapp/whatsapp.tipos.js';
import * as repositorio from './conversaciones.repositorio.js';
import type {
  ContextoDeConversacion,
  ConversacionDelPanel,
  MensajeDelPanel,
  MotivoDerivacion,
  PasoDeIA,
} from './conversaciones.tipos.js';

/** Cuántos mensajes recientes lee la IA. Más mensajes cuestan más tokens en cada respuesta. */
export const MENSAJES_DEL_HISTORIAL = 30;
/** Cuántas funciones anteriores ve la IA. Cada resultado son tokens en cada respuesta. */
export const PASOS_DEL_HISTORIAL = 20;
/**
 * Solo se devuelven las funciones recientes. Alcanza para el "sí" de una confirmación, y no
 * arrastra resultados viejos (un catálogo vacío, horas que ya se ocuparon) que el modelo
 * tomaría como vigentes.
 */
export const MINUTOS_VIGENCIA_PASOS = 30;
const MAX_DETALLE = 500;

export async function contextoDeConversacion(
  negocioId: string,
  conversacionId: string,
  ahora: Date = new Date(),
): Promise<ContextoDeConversacion> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  return conNegocio(negocioId, async (tx) => {
    const datos = await repositorio.datosDeLaConversacion(tx, conversacionId);
    if (!datos) throw new NoEncontrado('La conversación');
    const historial = await repositorio.historial(tx, conversacionId, MENSAJES_DEL_HISTORIAL);
    // Solo las funciones recientes y de la parte de la conversación que la IA alcanza a leer.
    const vigentes = new Date(ahora.getTime() - MINUTOS_VIGENCIA_PASOS * 60_000);
    const desde = historial[0] && historial[0].creadoEn > vigentes ? historial[0].creadoEn : vigentes;
    const pasos = historial[0] ? await repositorio.pasosDesde(tx, conversacionId, desde, PASOS_DEL_HISTORIAL) : [];
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

// ---------------------------------------------------------------------
// Panel: el dueño lee y responde. Es lo mínimo para atender una derivación, sobre todo la de un
// cliente que no comparte su teléfono: solo se le puede escribir por el número del negocio.
// ---------------------------------------------------------------------

export const MAX_CONVERSACIONES_PANEL = 100;
export const MAX_MENSAJES_PANEL = 200;

export function listarConversaciones(
  negocioId: string,
  estado: 'bot' | 'humano' | null,
  limite = 50,
): Promise<ConversacionDelPanel[]> {
  return conNegocio(negocioId, (tx) => repositorio.listarParaPanel(tx, estado, Math.min(limite, MAX_CONVERSACIONES_PANEL)));
}

export async function mensajesDeConversacion(negocioId: string, conversacionId: string, limite = 50): Promise<MensajeDelPanel[]> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  return conNegocio(negocioId, async (tx) => {
    if (!(await repositorio.datosDeLaConversacion(tx, conversacionId))) throw new NoEncontrado('La conversación');
    return repositorio.mensajesParaPanel(tx, conversacionId, Math.min(limite, MAX_MENSAJES_PANEL));
  });
}

/**
 * Responde como persona del negocio. Primero toma la conversación (la IA calla desde ya y el
 * modo humano dura otra vez sus horas) y después envía. Las reglas del envío (ventana de 24 h,
 * negocio suspendido, cuenta activa) las aplica enviarMensaje.
 */
export async function responderComoNegocio(
  negocioId: string,
  conversacionId: string,
  texto: string,
  ahora: Date = new Date(),
  envio: DependenciasEnvio = {},
): Promise<ResultadoEnvio> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  await conNegocio(negocioId, async (tx) => {
    await exigirNegocioOperativo(tx, negocioId);
    if (!(await repositorio.tomarConversacion(tx, conversacionId, ahora))) throw new NoEncontrado('La conversación');
  });
  return enviarMensaje({ negocioId, conversacionId, texto, emisor: 'humano' }, ahora, envio);
}
