import type { Transaccion } from '../db/contexto.js';

/** Único lugar con SQL del procesador de conversaciones pendientes. */

export interface Reservada {
  conversacionId: string;
  negocioId: string;
  clienteId: string;
  /** Hasta dónde se atiende: lo que llegue después queda pendiente para la vuelta siguiente. */
  pendienteEn: Date;
  intentos: number;
}

export interface Tiempos {
  /** Se responde cuando el último mensaje tiene al menos esta edad... */
  esperaMs: number;
  /** ...o cuando el primero sin responder tiene esta, aunque el cliente siga escribiendo. */
  esperaMaximaMs: number;
  /** Cuánto dura la reserva mientras se atiende. */
  reservaMs: number;
}

const milisegundos = (ms: number) => `${ms} milliseconds`;

/**
 * Quita lo que ya no se debe responder: conversaciones que pasaron a modo humano, y pendientes
 * de más de 24 horas, porque fuera de esa ventana WhatsApp ya no admite una respuesta libre.
 * Una conversación reservada se deja quieta: está a mitad de ser atendida.
 */
export async function descartarPendientes(tx: Transaccion, ahora: Date): Promise<number> {
  const { rowCount } = await tx.consultar(
    `UPDATE conversaciones
        SET ia_pendiente_desde = NULL, ia_pendiente_en = NULL, ia_intentos = 0, ia_reintentar_en = NULL
      WHERE ia_pendiente_en IS NOT NULL
        AND (ia_procesando_hasta IS NULL OR ia_procesando_hasta <= $1)
        AND (estado <> 'bot' OR ia_pendiente_en <= $1::timestamptz - interval '24 hours')`,
    [ahora],
  );
  return rowCount ?? 0;
}

/**
 * Reserva las conversaciones listas para responder, de cualquier negocio no suspendido.
 * SKIP LOCKED: si otra instancia está reservando las mismas, cada una se lleva otras distintas.
 */
export async function reservarPendientes(
  tx: Transaccion,
  ahora: Date,
  limite: number,
  tiempos: Tiempos,
): Promise<Reservada[]> {
  const { rows } = await tx.consultar<{
    id: string;
    negocio_id: string;
    cliente_id: string;
    ia_pendiente_en: Date;
    ia_intentos: number;
  }>(
    `WITH elegidas AS (
       SELECT c.id
         FROM conversaciones c
         JOIN negocios n ON n.id = c.negocio_id
        WHERE c.ia_pendiente_en IS NOT NULL
          AND c.estado = 'bot'
          AND n.estado <> 'suspendido'
          AND (c.ia_procesando_hasta IS NULL OR c.ia_procesando_hasta <= $1)
          AND (c.ia_reintentar_en IS NULL OR c.ia_reintentar_en <= $1)
          AND (c.ia_pendiente_en <= $1::timestamptz - $3::interval
               OR c.ia_pendiente_desde <= $1::timestamptz - $4::interval)
        ORDER BY c.ia_pendiente_desde, c.id
        LIMIT $2
        FOR UPDATE OF c SKIP LOCKED
     )
     UPDATE conversaciones c
        SET ia_procesando_hasta = $1::timestamptz + $5::interval
       FROM elegidas
      WHERE c.id = elegidas.id
     RETURNING c.id, c.negocio_id, c.cliente_id, c.ia_pendiente_en, c.ia_intentos`,
    [ahora, limite, milisegundos(tiempos.esperaMs), milisegundos(tiempos.esperaMaximaMs), milisegundos(tiempos.reservaMs)],
  );
  return rows.map((f) => ({
    conversacionId: f.id,
    negocioId: f.negocio_id,
    clienteId: f.cliente_id,
    pendienteEn: f.ia_pendiente_en,
    intentos: f.ia_intentos,
  }));
}

/**
 * Atendida. Si llegó otro mensaje mientras tanto, sigue pendiente desde ese mensaje y se
 * responde en la vuelta siguiente; si no, queda sin nada pendiente.
 */
export async function terminar(tx: Transaccion, conversacionId: string, pendienteEn: Date): Promise<void> {
  await tx.consultar(
    `UPDATE conversaciones
        SET ia_procesando_hasta = NULL, ia_intentos = 0, ia_reintentar_en = NULL,
            ia_pendiente_desde = CASE WHEN ia_pendiente_en > $2 THEN ia_pendiente_en END,
            ia_pendiente_en    = CASE WHEN ia_pendiente_en > $2 THEN ia_pendiente_en END
      WHERE id = $1`,
    [conversacionId, pendienteEn],
  );
}

/** Falló: se suelta la reserva y se espera antes del siguiente intento. */
export async function registrarFallo(tx: Transaccion, conversacionId: string, reintentarEn: Date): Promise<void> {
  await tx.consultar(
    `UPDATE conversaciones
        SET ia_procesando_hasta = NULL, ia_intentos = ia_intentos + 1, ia_reintentar_en = $2
      WHERE id = $1`,
    [conversacionId, reintentarEn],
  );
}

/**
 * Se agotaron los intentos: la conversación pasa a una persona (la IA calla) y queda la
 * derivación con motivo `error`. El aviso al dueño por plantilla llega con las tareas de WhatsApp.
 */
export async function derivarPorError(tx: Transaccion, negocioId: string, conversacionId: string, ahora: Date): Promise<void> {
  await tx.consultar(
    `INSERT INTO derivaciones (negocio_id, conversacion_id, motivo) VALUES ($1, $2, 'error')`,
    [negocioId, conversacionId],
  );
  await tx.consultar(
    `UPDATE conversaciones
        SET estado = 'humano', humano_desde = $2,
            ia_pendiente_desde = NULL, ia_pendiente_en = NULL,
            ia_procesando_hasta = NULL, ia_intentos = 0, ia_reintentar_en = NULL
      WHERE id = $1`,
    [conversacionId, ahora],
  );
}
