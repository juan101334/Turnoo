import type { Transaccion } from '../../db/contexto.js';

/**
 * Único lugar con SQL de los avisos al dueño. Las reservas cruzan negocios (conSistema); los
 * datos de cada aviso se leen y se anotan con el negocio de ese aviso (conNegocio).
 */

const milisegundos = (ms: number) => `${ms} milliseconds`;

/** Derivaciones con aviso pendiente de más de 24 h: ya no se avisan. */
export async function vencerAvisos(tx: Transaccion, ahora: Date, vigenciaMs: number): Promise<number> {
  const { rowCount } = await tx.consultar(
    `UPDATE derivaciones SET aviso_resultado = 'vencido', aviso_reservado_hasta = NULL
      WHERE aviso_resultado IS NULL AND created_at <= $1::timestamptz - $2::interval
        AND (aviso_reservado_hasta IS NULL OR aviso_reservado_hasta <= $1)`,
    [ahora, milisegundos(vigenciaMs)],
  );
  return rowCount ?? 0;
}

/**
 * Reserva derivaciones por avisar de negocios con teléfono de avisos y no suspendidos. Las que
 * no tienen teléfono se quedan pendientes: se avisan si el dueño lo configura antes de 24 h.
 */
export async function reservarDerivaciones(
  tx: Transaccion,
  ahora: Date,
  limite: number,
  reservaMs: number,
): Promise<{ id: string; negocioId: string }[]> {
  const { rows } = await tx.consultar<{ id: string; negocio_id: string }>(
    `WITH elegidas AS (
       SELECT d.id
         FROM derivaciones d
         JOIN negocios n ON n.id = d.negocio_id
        WHERE d.aviso_resultado IS NULL
          AND n.telefono_avisos IS NOT NULL
          AND n.estado <> 'suspendido'
          AND (d.aviso_reservado_hasta IS NULL OR d.aviso_reservado_hasta <= $1)
        ORDER BY d.created_at, d.id
        LIMIT $2
        FOR UPDATE OF d SKIP LOCKED
     )
     UPDATE derivaciones d SET aviso_reservado_hasta = $1::timestamptz + $3::interval
       FROM elegidas WHERE d.id = elegidas.id
     RETURNING d.id, d.negocio_id`,
    [ahora, limite, milisegundos(reservaMs)],
  );
  return rows.map((f) => ({ id: f.id, negocioId: f.negocio_id }));
}

export interface DatosDelAviso {
  motivo: string;
  detalle: string | null;
  creadaEn: Date;
  telefonoAvisos: string | null;
  zonaHoraria: string;
  horasModoHumano: number;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  phoneNumberId: string;
  tokenCifrado: string;
  cuentaActiva: boolean;
}

export async function datosDelAviso(tx: Transaccion, derivacionId: string): Promise<DatosDelAviso | null> {
  const { rows } = await tx.consultar<{
    motivo: string;
    detalle: string | null;
    created_at: Date;
    telefono_avisos: string | null;
    zona_horaria: string;
    horas_modo_humano: number;
    cliente_nombre: string | null;
    cliente_telefono: string | null;
    phone_number_id: string;
    token_acceso_cifrado: string;
    activa: boolean;
  }>(
    `SELECT d.motivo, d.detalle, d.created_at, n.telefono_avisos, n.zona_horaria, cf.horas_modo_humano,
            cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono,
            w.phone_number_id, w.token_acceso_cifrado, w.activa
       FROM derivaciones d
       JOIN negocios n ON n.id = d.negocio_id
       JOIN configuracion_negocio cf ON cf.negocio_id = d.negocio_id
       JOIN conversaciones c ON c.id = d.conversacion_id
       JOIN clientes cl ON cl.id = c.cliente_id
       JOIN whatsapp_cuentas w ON w.id = c.whatsapp_cuenta_id
      WHERE d.id = $1`,
    [derivacionId],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    motivo: f.motivo,
    detalle: f.detalle,
    creadaEn: f.created_at,
    telefonoAvisos: f.telefono_avisos,
    zonaHoraria: f.zona_horaria,
    horasModoHumano: f.horas_modo_humano,
    clienteNombre: f.cliente_nombre,
    clienteTelefono: f.cliente_telefono,
    phoneNumberId: f.phone_number_id,
    tokenCifrado: f.token_acceso_cifrado,
    cuentaActiva: f.activa,
  };
}

export async function marcarAvisada(tx: Transaccion, derivacionId: string, ahora: Date): Promise<void> {
  await tx.consultar(
    `UPDATE derivaciones SET aviso_resultado = 'enviado', avisada_en = $2, aviso_reservado_hasta = NULL WHERE id = $1`,
    [derivacionId, ahora],
  );
}

/** Falló: se suelta la reserva para reintentar, o queda fallida si no tiene arreglo o se agotaron los intentos. */
export async function registrarFalloDeAviso(tx: Transaccion, derivacionId: string, definitivo: boolean, maxIntentos: number): Promise<void> {
  await tx.consultar(
    `UPDATE derivaciones
        SET aviso_intentos = aviso_intentos + 1, aviso_reservado_hasta = NULL,
            aviso_resultado = CASE WHEN $2 OR aviso_intentos + 1 >= $3 THEN 'fallido' END
      WHERE id = $1`,
    [derivacionId, definitivo, maxIntentos],
  );
}

export async function sumarPlantilla(tx: Transaccion, negocioId: string, periodo: string): Promise<void> {
  await tx.consultar(
    `INSERT INTO uso_mensual (negocio_id, periodo, plantillas_enviadas) VALUES ($1, $2::date, 1)
     ON CONFLICT (negocio_id, periodo) DO UPDATE SET plantillas_enviadas = uso_mensual.plantillas_enviadas + 1`,
    [negocioId, periodo],
  );
}

export interface LimitePorAvisar {
  negocioId: string;
  periodo: string;
  nombreNegocio: string;
  usadas: number;
  limite: number;
}

/**
 * Toma los negocios que llegaron al 80% de las conversaciones de IA del mes (en su zona) y aún
 * no recibieron el aviso. Lo marca de una vez: dos instancias no avisan dos veces.
 */
export async function reservarAvisosDeLimite(tx: Transaccion, ahora: Date, limite: number): Promise<LimitePorAvisar[]> {
  const { rows } = await tx.consultar<{ negocio_id: string; periodo: string; nombre: string; usadas: number; limite: number }>(
    `WITH elegidos AS (
       SELECT u.negocio_id, u.periodo
         FROM uso_mensual u
         JOIN negocios n ON n.id = u.negocio_id
         JOIN planes p ON p.id = n.plan_id
        WHERE u.aviso_limite_en IS NULL
          AND p.max_conversaciones_ia_mes IS NOT NULL
          AND u.conversaciones_ia * 10 >= p.max_conversaciones_ia_mes * 8
          AND u.periodo = (date_trunc('month', $1::timestamptz AT TIME ZONE n.zona_horaria))::date
          AND n.telefono_avisos IS NOT NULL
          AND n.estado <> 'suspendido'
        LIMIT $2
        FOR UPDATE OF u SKIP LOCKED
     )
     UPDATE uso_mensual u SET aviso_limite_en = $1
       FROM elegidos e, negocios n, planes p
      WHERE u.negocio_id = e.negocio_id AND u.periodo = e.periodo AND n.id = u.negocio_id AND p.id = n.plan_id
     RETURNING u.negocio_id, to_char(u.periodo, 'YYYY-MM-DD') AS periodo, n.nombre, u.conversaciones_ia AS usadas, p.max_conversaciones_ia_mes AS limite`,
    [ahora, limite],
  );
  return rows.map((f) => ({ negocioId: f.negocio_id, periodo: f.periodo, nombreNegocio: f.nombre, usadas: f.usadas, limite: f.limite }));
}

/** Un fallo pasajero: se quita la marca para que la tarea siguiente lo vuelva a intentar. */
export async function liberarAvisoDeLimite(tx: Transaccion, negocioId: string, periodo: string): Promise<void> {
  await tx.consultar(`UPDATE uso_mensual SET aviso_limite_en = NULL WHERE negocio_id = $1 AND periodo = $2::date`, [negocioId, periodo]);
}

/** Teléfono de avisos y una cuenta activa del negocio, para el aviso del límite. */
export async function destinoDelNegocio(
  tx: Transaccion,
  negocioId: string,
): Promise<{ telefonoAvisos: string | null; phoneNumberId: string; tokenCifrado: string } | null> {
  const { rows } = await tx.consultar<{ telefono_avisos: string | null; phone_number_id: string; token_acceso_cifrado: string }>(
    `SELECT n.telefono_avisos, w.phone_number_id, w.token_acceso_cifrado
       FROM negocios n JOIN whatsapp_cuentas w ON w.negocio_id = n.id AND w.activa
      WHERE n.id = $1
      ORDER BY w.created_at, w.id
      LIMIT 1`,
    [negocioId],
  );
  const f = rows[0];
  return f ? { telefonoAvisos: f.telefono_avisos, phoneNumberId: f.phone_number_id, tokenCifrado: f.token_acceso_cifrado } : null;
}
