import { claveDeTokens, descifrar } from '../../compartido/cifrado.js';
import { NoEncontrado } from '../../compartido/errores.js';
import { logger } from '../../compartido/logger.js';
import { primerDiaDelMes } from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import { ErrorDelModelo, transcribirAudio, type DependenciasAudio } from '../ia/ia.proveedor.js';
import { sumarSegundosDeAudio } from '../uso/uso.repositorio.js';
import { descargarMediaDeMeta, type MediaDeMeta } from '../whatsapp/whatsapp.meta.js';
import { guardarArchivo, leerArchivo, rutaDeImagen } from './adjuntos.archivos.js';
import { duracionOggOpus, formatoDeAudio, MIME_POR_EXTENSION, tipoDeImagen } from './adjuntos.formatos.js';
import * as repositorio from './adjuntos.repositorio.js';
import type { ErrorDeAdjunto } from './adjuntos.repositorio.js';

/**
 * Notas de voz e imágenes que envían los clientes. Se procesan justo antes de que la IA atienda
 * la conversación, fuera del webhook (Meta espera respuesta rápida).
 *
 * - Nota de voz: se descarga, se transcribe y se guarda SOLO el texto; el audio se descarta.
 *   Más de 2 minutos no se transcribe: la IA le pide al cliente que la resuma o la escriba.
 * - Imagen: jpg, png o webp de hasta 5 MB, reconocida por sus bytes. Se guarda en el disco y se
 *   adjunta a la cita que agende el cliente. La IA no la ve y no va a OpenAI.
 * - Un fallo pasajero (red, Meta u OpenAI caídos) lanza, y el procesador reintenta. Uno
 *   definitivo (muy largo, formato no admitido) queda en `adjunto_error` y no se reintenta.
 */

export const MAX_SEGUNDOS_AUDIO = 120;
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
/** El máximo de WhatsApp para un audio. */
const MAX_BYTES_AUDIO = 16 * 1024 * 1024;
/** Sin duración legible (mp3, m4a), el tope es por tamaño: unos 2 minutos a 128 kbps. */
export const MAX_BYTES_AUDIO_SIN_DURACION = 2 * 1024 * 1024;
/** Adjuntos que se procesan por atención: acota el costo si alguien envía muchos de golpe. */
export const MAX_ADJUNTOS_POR_ATENCION = 5;
/** Meta guarda los archivos un tiempo limitado, y la IA solo lee lo reciente. */
const HORAS_ADJUNTOS = 24;

export interface DependenciasAdjuntos {
  meta?: typeof fetch;
  audio?: DependenciasAudio;
  clave?: () => Buffer;
}

/** Un fallo definitivo de la descarga se anota; uno pasajero lanza para que el procesador reintente. */
function errorDeDescarga(r: Extract<MediaDeMeta, { ok: false }>, siEsGrande: ErrorDeAdjunto): ErrorDeAdjunto {
  if (r.reintentable) throw new Error(`No se pudo descargar un adjunto: ${r.detalle}`);
  return r.motivo === 'muy_grande' ? siEsGrande : 'no_disponible';
}

async function procesarAudio(
  negocioId: string,
  zonaHoraria: string,
  ahora: Date,
  mensajeId: string,
  media: MediaDeMeta,
  deps: DependenciasAdjuntos,
): Promise<ErrorDeAdjunto | null> {
  if (!media.ok) return errorDeDescarga(media, 'audio_muy_largo');
  const formato = formatoDeAudio(media.bytes);
  if (!formato) return 'audio_no_soportado';
  const duracion = formato.mimeType === 'audio/ogg' ? duracionOggOpus(media.bytes) : null;
  if (duracion !== null && duracion > MAX_SEGUNDOS_AUDIO) return 'audio_muy_largo';
  if (duracion === null && media.bytes.length > MAX_BYTES_AUDIO_SIN_DURACION) return 'audio_muy_largo';

  let transcripcion;
  try {
    transcripcion = await transcribirAudio({ bytes: media.bytes, ...formato }, deps.audio);
  } catch (error) {
    if (error instanceof ErrorDelModelo && !error.reintentable) return 'audio_no_soportado';
    throw error;
  }
  const segundos = transcripcion.segundos || Math.ceil(duracion ?? 0);
  await conNegocio(negocioId, async (tx) => {
    await repositorio.guardarTranscripcion(tx, mensajeId, transcripcion.texto);
    if (segundos > 0) await sumarSegundosDeAudio(tx, negocioId, primerDiaDelMes(ahora, zonaHoraria), segundos);
  });
  return null;
}

async function procesarImagen(negocioId: string, mensajeId: string, media: MediaDeMeta): Promise<ErrorDeAdjunto | null> {
  if (!media.ok) return errorDeDescarga(media, 'imagen_muy_grande');
  const tipo = tipoDeImagen(media.bytes);
  if (!tipo) return 'imagen_no_soportada';
  // Si el proceso cae entre estos dos pasos, el reintento vuelve a escribir el mismo archivo.
  const ruta = rutaDeImagen(negocioId, mensajeId, tipo.extension);
  await guardarArchivo(ruta, media.bytes);
  await conNegocio(negocioId, (tx) => repositorio.guardarRutaDeArchivo(tx, mensajeId, ruta));
  return null;
}

/** Procesa los adjuntos pendientes de la conversación. Devuelve cuántos procesó (con o sin error). */
export async function prepararAdjuntos(
  negocioId: string,
  conversacionId: string,
  zonaHoraria: string,
  ahora: Date,
  deps: DependenciasAdjuntos = {},
): Promise<number> {
  const desde = new Date(ahora.getTime() - HORAS_ADJUNTOS * 3_600_000);
  const { pendientes, tokenCifrado } = await conNegocio(negocioId, async (tx) => ({
    pendientes: await repositorio.pendientes(tx, conversacionId, desde, MAX_ADJUNTOS_POR_ATENCION),
    tokenCifrado: await repositorio.tokenCifradoDeConversacion(tx, conversacionId),
  }));
  if (pendientes.length === 0) return 0;
  if (!tokenCifrado) throw new NoEncontrado('La conversación');
  const token = descifrar(tokenCifrado, (deps.clave ?? claveDeTokens)());

  // Un fallo pasajero lanza: lo ya procesado queda guardado y el reintento sigue con lo que falta.
  for (const p of pendientes) {
    const error =
      p.tipo === 'audio'
        ? await procesarAudio(negocioId, zonaHoraria, ahora, p.mensajeId, await descargarMediaDeMeta(token, p.mediaId, MAX_BYTES_AUDIO, deps.meta), deps)
        : await procesarImagen(negocioId, p.mensajeId, await descargarMediaDeMeta(token, p.mediaId, MAX_BYTES_IMAGEN, deps.meta));
    if (error) {
      await conNegocio(negocioId, (tx) => repositorio.marcarError(tx, p.mensajeId, error));
      logger.info({ negocioId, tipo: p.tipo, error }, 'Adjunto del cliente no procesado');
    }
  }
  return pendientes.length;
}

/** Al agendar, la cita se lleva las imágenes recientes de la conversación que aún no tienen cita. */
export async function adjuntarImagenesRecientes(negocioId: string, conversacionId: string, citaId: string, ahora: Date): Promise<number> {
  const desde = new Date(ahora.getTime() - HORAS_ADJUNTOS * 3_600_000);
  return conNegocio(negocioId, (tx) => repositorio.adjuntarImagenes(tx, conversacionId, citaId, desde));
}

const extensionDe = (ruta: string) => ruta.slice(ruta.lastIndexOf('.') + 1);

export async function imagenesDeCita(negocioId: string, citaId: string): Promise<{ id: string; creadoEn: Date; mimeType: string }[]> {
  if (!esUuid(citaId)) throw new NoEncontrado('La cita');
  const imagenes = await conNegocio(negocioId, (tx) => repositorio.imagenesDeCita(tx, citaId));
  return imagenes.map((i) => ({ id: i.id, creadoEn: i.creadoEn, mimeType: MIME_POR_EXTENSION[extensionDe(i.archivoRuta)] ?? 'application/octet-stream' }));
}

/** El archivo de una imagen, solo si está adjunta a esa cita. */
export async function leerImagenDeCita(negocioId: string, citaId: string, imagenId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!esUuid(citaId) || !esUuid(imagenId)) throw new NoEncontrado('La imagen');
  const imagen = (await conNegocio(negocioId, (tx) => repositorio.imagenesDeCita(tx, citaId))).find((i) => i.id === imagenId);
  if (!imagen) throw new NoEncontrado('La imagen');
  const mimeType = MIME_POR_EXTENSION[extensionDe(imagen.archivoRuta)] ?? 'application/octet-stream';
  try {
    return { bytes: await leerArchivo(imagen.archivoRuta), mimeType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NoEncontrado('La imagen');
    throw error;
  }
}
