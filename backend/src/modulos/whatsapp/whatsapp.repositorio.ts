import type { Transaccion } from '../../db/contexto.js';
import type { MensajeEntrante } from './whatsapp.tipos.js';

/** Bloquea la conversación: los mensajes de un mismo cliente se guardan de uno en uno. */
export async function obtenerOCrearConversacion(
  tx: Transaccion,
  negocioId: string,
  clienteId: string,
  cuentaId: string,
): Promise<string> {
  const { rows } = await tx.consultar<{ id: string }>(
    `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (whatsapp_cuenta_id, cliente_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [negocioId, clienteId, cuentaId],
  );
  return rows[0]!.id;
}

/** Devuelve false si el mensaje ya estaba: Meta puede enviar el mismo más de una vez. */
export async function guardarMensajeEntrante(
  tx: Transaccion,
  negocioId: string,
  conversacionId: string,
  mensaje: MensajeEntrante,
): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    `INSERT INTO mensajes (negocio_id, conversacion_id, wa_message_id, direccion, emisor, tipo, contenido, media_id, creado_en)
     VALUES ($1, $2, $3, 'entrante', 'cliente', $4, $5, $6, $7)
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [negocioId, conversacionId, mensaje.waMessageId, mensaje.tipo, mensaje.contenido, mensaje.mediaId, mensaje.enviadoEn],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Anota la actividad y devuelve la conversación a la IA si ya pasaron las horas del modo humano:
 * es una evaluación al llegar el mensaje, no una tarea. GREATEST: un reenvío atrasado no retrocede
 * las fechas, de las que depende la ventana de 24 h de WhatsApp.
 */
export async function registrarMensajeDelCliente(
  tx: Transaccion,
  conversacionId: string,
  enviadoEn: Date,
): Promise<void> {
  await tx.consultar(
    `UPDATE conversaciones c
        SET ultimo_mensaje_cliente_en = GREATEST(c.ultimo_mensaje_cliente_en, $2),
            ultimo_mensaje_en = GREATEST(c.ultimo_mensaje_en, $2),
            estado = CASE WHEN c.estado = 'humano'
                           AND c.humano_desde + make_interval(hours => cfg.horas_modo_humano) <= $2
                          THEN 'bot' ELSE c.estado END,
            humano_desde = CASE WHEN c.estado = 'humano'
                                 AND c.humano_desde + make_interval(hours => cfg.horas_modo_humano) <= $2
                                THEN NULL ELSE c.humano_desde END
       FROM configuracion_negocio cfg
      WHERE c.id = $1 AND cfg.negocio_id = c.negocio_id`,
    [conversacionId, enviadoEn],
  );
}
