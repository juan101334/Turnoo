import type { Transaccion } from '../../db/contexto.js';

/** Único lugar con SQL de los adjuntos (notas de voz e imágenes de los clientes). */

export type ErrorDeAdjunto = 'audio_muy_largo' | 'audio_no_soportado' | 'imagen_no_soportada' | 'imagen_muy_grande' | 'no_disponible';

export interface AdjuntoPendiente {
  mensajeId: string;
  tipo: 'audio' | 'imagen';
  mediaId: string;
}

/**
 * Notas de voz sin transcribir e imágenes sin guardar de una conversación, de las más viejas a
 * las más nuevas. Solo las recientes: lo más viejo ya no lo lee la IA, y Meta borra los archivos.
 */
export async function pendientes(tx: Transaccion, conversacionId: string, desde: Date, limite: number): Promise<AdjuntoPendiente[]> {
  const { rows } = await tx.consultar<{ id: string; tipo: 'audio' | 'imagen'; media_id: string }>(
    `SELECT id, tipo, media_id FROM mensajes
      WHERE conversacion_id = $1 AND direccion = 'entrante' AND media_id IS NOT NULL
        AND adjunto_error IS NULL AND creado_en >= $2
        AND ((tipo = 'audio' AND transcripcion IS NULL) OR (tipo = 'imagen' AND archivo_ruta IS NULL))
      ORDER BY creado_en, id
      LIMIT $3`,
    [conversacionId, desde, limite],
  );
  return rows.map((f) => ({ mensajeId: f.id, tipo: f.tipo, mediaId: f.media_id }));
}

/** Las condiciones de cada UPDATE hacen que un adjunto ya procesado no se pise. */
export async function guardarTranscripcion(tx: Transaccion, mensajeId: string, texto: string): Promise<void> {
  await tx.consultar(
    `UPDATE mensajes SET transcripcion = $2 WHERE id = $1 AND transcripcion IS NULL AND adjunto_error IS NULL`,
    [mensajeId, texto],
  );
}

export async function guardarRutaDeArchivo(tx: Transaccion, mensajeId: string, ruta: string): Promise<void> {
  await tx.consultar(`UPDATE mensajes SET archivo_ruta = $2 WHERE id = $1 AND archivo_ruta IS NULL`, [mensajeId, ruta]);
}

export async function marcarError(tx: Transaccion, mensajeId: string, error: ErrorDeAdjunto): Promise<void> {
  await tx.consultar(`UPDATE mensajes SET adjunto_error = $2 WHERE id = $1 AND adjunto_error IS NULL`, [mensajeId, error]);
}

/** Adjunta a la cita las imágenes guardadas de la conversación que aún no tienen cita. */
export async function adjuntarImagenes(tx: Transaccion, conversacionId: string, citaId: string, desde: Date): Promise<number> {
  const { rowCount } = await tx.consultar(
    `UPDATE mensajes SET cita_id = $2
      WHERE conversacion_id = $1 AND tipo = 'imagen' AND direccion = 'entrante'
        AND archivo_ruta IS NOT NULL AND cita_id IS NULL AND creado_en >= $3`,
    [conversacionId, citaId, desde],
  );
  return rowCount ?? 0;
}

export interface ImagenDeCita {
  id: string;
  archivoRuta: string;
  creadoEn: Date;
}

export async function imagenesDeCita(tx: Transaccion, citaId: string): Promise<ImagenDeCita[]> {
  const { rows } = await tx.consultar<{ id: string; archivo_ruta: string; creado_en: Date }>(
    `SELECT id, archivo_ruta, creado_en FROM mensajes WHERE cita_id = $1 ORDER BY creado_en, id`,
    [citaId],
  );
  return rows.map((f) => ({ id: f.id, archivoRuta: f.archivo_ruta, creadoEn: f.creado_en }));
}

/** Los archivos guardados de un cliente, para borrarlos del disco al anonimizarlo. */
export async function archivosDelCliente(tx: Transaccion, clienteId: string): Promise<string[]> {
  const { rows } = await tx.consultar<{ archivo_ruta: string }>(
    `SELECT m.archivo_ruta FROM mensajes m JOIN conversaciones c ON c.id = m.conversacion_id
      WHERE c.cliente_id = $1 AND m.archivo_ruta IS NOT NULL`,
    [clienteId],
  );
  return rows.map((f) => f.archivo_ruta);
}

/** El token cifrado de la cuenta por la que llegó la conversación. */
export async function tokenCifradoDeConversacion(tx: Transaccion, conversacionId: string): Promise<string | null> {
  const { rows } = await tx.consultar<{ token: string }>(
    `SELECT w.token_acceso_cifrado AS token FROM conversaciones c JOIN whatsapp_cuentas w ON w.id = c.whatsapp_cuenta_id WHERE c.id = $1`,
    [conversacionId],
  );
  return rows[0]?.token ?? null;
}
