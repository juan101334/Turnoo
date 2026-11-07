import type { Transaccion } from '../../db/contexto.js';

/**
 * Único lugar con SQL de los recordatorios. Las búsquedas y reservas cruzan negocios
 * (conSistema); los datos de cada recordatorio se leen y se anotan con su negocio (conNegocio).
 */

const ACTIVA = `estado IN ('pendiente', 'confirmada')`;
const LIBRE = `(recordatorio_reservado_hasta IS NULL OR recordatorio_reservado_hasta <= $1)`;
const milisegundos = (ms: number) => `${ms} milliseconds`;

export type ResultadoOmitido = 'vencido' | 'agendada_tarde' | 'sin_consentimiento' | 'sin_telefono';

/** Citas a las que ya no les alcanza el tiempo: empiezan antes de `ahora + margen`. */
export async function vencerRecordatorios(tx: Transaccion, ahora: Date, margenMs: number): Promise<number> {
  const { rowCount } = await tx.consultar(
    `UPDATE citas SET recordatorio_resultado = 'vencido', recordatorio_reservado_hasta = NULL
      WHERE recordatorio_resultado IS NULL AND ${ACTIVA} AND ${LIBRE}
        AND inicio <= $1::timestamptz + $2::interval`,
    [ahora, milisegundos(margenMs)],
  );
  return rowCount ?? 0;
}

export interface Candidata {
  id: string;
  negocioId: string;
  inicio: Date;
  programadaEn: Date;
  horasRecordatorio: number;
  noAntesDe: string;
  noDespuesDe: string;
  zonaHoraria: string;
}

/**
 * Citas pendientes de recordatorio que podrían tocar pronto (empiezan dentro de sus horas de
 * recordatorio más un día), de negocios no suspendidos. Cuál toca ya lo decide el servicio.
 */
export async function candidatas(tx: Transaccion, ahora: Date, limite: number): Promise<Candidata[]> {
  const { rows } = await tx.consultar<{
    id: string;
    negocio_id: string;
    inicio: Date;
    programada_en: Date;
    horas_recordatorio: number;
    recordatorio_no_antes_de: string;
    recordatorio_no_despues_de: string;
    zona_horaria: string;
  }>(
    `SELECT c.id, c.negocio_id, c.inicio, c.programada_en, cf.horas_recordatorio,
            cf.recordatorio_no_antes_de, cf.recordatorio_no_despues_de, n.zona_horaria
       FROM citas c
       JOIN negocios n ON n.id = c.negocio_id
       JOIN configuracion_negocio cf ON cf.negocio_id = c.negocio_id
      WHERE c.recordatorio_resultado IS NULL AND c.${ACTIVA}
        AND (c.recordatorio_reservado_hasta IS NULL OR c.recordatorio_reservado_hasta <= $1)
        AND n.estado <> 'suspendido'
        AND c.inicio <= $1::timestamptz + (cf.horas_recordatorio + 24) * interval '1 hour'
      ORDER BY c.inicio, c.id
      LIMIT $2`,
    [ahora, limite],
  );
  return rows.map((f) => ({
    id: f.id,
    negocioId: f.negocio_id,
    inicio: f.inicio,
    programadaEn: f.programada_en,
    horasRecordatorio: f.horas_recordatorio,
    noAntesDe: f.recordatorio_no_antes_de.slice(0, 5),
    noDespuesDe: f.recordatorio_no_despues_de.slice(0, 5),
    zonaHoraria: f.zona_horaria,
  }));
}

/** Reserva por un rato las que tocan; dos instancias nunca toman la misma. */
export async function reservar(tx: Transaccion, ids: string[], ahora: Date, reservaMs: number): Promise<{ id: string; negocioId: string }[]> {
  const { rows } = await tx.consultar<{ id: string; negocio_id: string }>(
    `WITH elegidas AS (
       SELECT id FROM citas
        WHERE id = ANY($2::uuid[]) AND recordatorio_resultado IS NULL AND ${ACTIVA} AND ${LIBRE}
        FOR UPDATE SKIP LOCKED
     )
     UPDATE citas c SET recordatorio_reservado_hasta = $1::timestamptz + $3::interval
       FROM elegidas WHERE c.id = elegidas.id
     RETURNING c.id, c.negocio_id`,
    [ahora, ids, milisegundos(reservaMs)],
  );
  return rows.map((f) => ({ id: f.id, negocioId: f.negocio_id }));
}

/** Anota por qué no se envía, solo si sigue pendiente. */
export async function omitir(tx: Transaccion, ids: string[], resultado: ResultadoOmitido): Promise<void> {
  await tx.consultar(
    `UPDATE citas SET recordatorio_resultado = $2, recordatorio_reservado_hasta = NULL
      WHERE id = ANY($1::uuid[]) AND recordatorio_resultado IS NULL`,
    [ids, resultado],
  );
}

export interface DatosDelRecordatorio {
  inicio: Date;
  zonaHoraria: string;
  negocioNombre: string;
  profesionalNombre: string;
  servicios: string[];
  clienteNombre: string | null;
  clienteTelefono: string | null;
  consintio: boolean;
  phoneNumberId: string | null;
  tokenCifrado: string | null;
}

/**
 * Lo que lleva la plantilla. Se envía por la cuenta de la última conversación del cliente, o
 * por la primera cuenta activa del negocio. Null si la cita ya no está pendiente de recordatorio.
 */
export async function datosDelRecordatorio(tx: Transaccion, citaId: string): Promise<DatosDelRecordatorio | null> {
  const { rows } = await tx.consultar<{
    inicio: Date;
    zona_horaria: string;
    negocio: string;
    profesional: string;
    servicios: string[] | null;
    cliente_nombre: string | null;
    cliente_telefono: string | null;
    consintio: boolean;
    phone_number_id: string | null;
    token_acceso_cifrado: string | null;
  }>(
    `SELECT c.inicio, n.zona_horaria, n.nombre AS negocio, p.nombre AS profesional,
            (SELECT array_agg(cs.nombre ORDER BY cs.orden, cs.nombre) FROM cita_servicios cs WHERE cs.cita_id = c.id) AS servicios,
            cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono,
            EXISTS (SELECT 1 FROM consentimientos co WHERE co.cliente_id = cl.id) AS consintio,
            w.phone_number_id, w.token_acceso_cifrado
       FROM citas c
       JOIN negocios n ON n.id = c.negocio_id
       JOIN profesionales p ON p.id = c.profesional_id
       JOIN clientes cl ON cl.id = c.cliente_id
       LEFT JOIN LATERAL (
         SELECT w.phone_number_id, w.token_acceso_cifrado
           FROM whatsapp_cuentas w
          WHERE w.negocio_id = c.negocio_id AND w.activa
          ORDER BY (w.id = (SELECT cv.whatsapp_cuenta_id FROM conversaciones cv
                             WHERE cv.cliente_id = cl.id
                             ORDER BY cv.ultimo_mensaje_cliente_en DESC NULLS LAST, cv.id LIMIT 1)) DESC NULLS LAST,
                   w.created_at, w.id
          LIMIT 1
       ) w ON true
      WHERE c.id = $1 AND c.recordatorio_resultado IS NULL AND c.${ACTIVA}`,
    [citaId],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    inicio: f.inicio,
    zonaHoraria: f.zona_horaria,
    negocioNombre: f.negocio,
    profesionalNombre: f.profesional,
    servicios: f.servicios ?? [],
    clienteNombre: f.cliente_nombre,
    clienteTelefono: f.cliente_telefono,
    consintio: f.consintio,
    phoneNumberId: f.phone_number_id,
    tokenCifrado: f.token_acceso_cifrado,
  };
}

export async function marcarEnviado(tx: Transaccion, citaId: string, ahora: Date): Promise<void> {
  await tx.consultar(
    `UPDATE citas SET recordatorio_resultado = 'enviado', recordatorio_enviado_en = $2, recordatorio_reservado_hasta = NULL
      WHERE id = $1`,
    [citaId, ahora],
  );
}

/** Falló: se suelta la reserva para reintentar, o queda fallido si no tiene arreglo o se agotaron los intentos. */
export async function registrarFallo(tx: Transaccion, citaId: string, definitivo: boolean, maxIntentos: number): Promise<void> {
  await tx.consultar(
    `UPDATE citas
        SET recordatorio_intentos = recordatorio_intentos + 1, recordatorio_reservado_hasta = NULL,
            recordatorio_resultado = CASE WHEN $2 OR recordatorio_intentos + 1 >= $3 THEN 'fallido' END
      WHERE id = $1`,
    [citaId, definitivo, maxIntentos],
  );
}
