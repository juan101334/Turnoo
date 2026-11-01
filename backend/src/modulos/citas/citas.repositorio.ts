import type { Transaccion } from '../../db/contexto.js';
import type { HorarioTrabajo, Intervalo, ReglasDeAgenda, ServicioDeCita } from './citas.tipos.js';

/** Único lugar con SQL del módulo de citas. Recibe la transacción ya limitada a un negocio. */

export async function obtenerReglasDeAgenda(
  tx: Transaccion,
  negocioId: string,
): Promise<ReglasDeAgenda | null> {
  const { rows } = await tx.consultar<{
    zona_horaria: string;
    intervalo_minutos: number;
    anticipacion_min_minutos: number;
    anticipacion_max_dias: number;
  }>(
    `SELECT n.zona_horaria, c.intervalo_minutos, c.anticipacion_min_minutos, c.anticipacion_max_dias
       FROM negocios n
       JOIN configuracion_negocio c ON c.negocio_id = n.id
      WHERE n.id = $1`,
    [negocioId],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    zonaHoraria: fila.zona_horaria,
    intervaloMinutos: fila.intervalo_minutos,
    anticipacionMinMinutos: fila.anticipacion_min_minutos,
    anticipacionMaxDias: fila.anticipacion_max_dias,
  };
}

export async function existeProfesionalActivo(
  tx: Transaccion,
  profesionalId: string,
): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    'SELECT 1 FROM profesionales WHERE id = $1 AND activo',
    [profesionalId],
  );
  return (rowCount ?? 0) > 0;
}

/** Servicios activos de ese barbero cuyo id esté en la lista (los que no coincidan no aparecen). */
export async function obtenerServiciosDelProfesional(
  tx: Transaccion,
  profesionalId: string,
  servicioIds: string[],
): Promise<ServicioDeCita[]> {
  const { rows } = await tx.consultar<{
    id: string;
    nombre: string;
    duracion_minutos: number;
    precio_cop: number;
  }>(
    `SELECT id, nombre, duracion_minutos, precio_cop
       FROM servicios
      WHERE profesional_id = $1 AND activo AND id = ANY($2::uuid[])`,
    [profesionalId, servicioIds],
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    duracionMinutos: fila.duracion_minutos,
    precioCop: fila.precio_cop,
  }));
}

export async function obtenerHorariosDeTrabajo(
  tx: Transaccion,
  profesionalId: string,
): Promise<HorarioTrabajo[]> {
  const { rows } = await tx.consultar<{
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
  }>(
    'SELECT dia_semana, hora_inicio, hora_fin FROM horarios_trabajo WHERE profesional_id = $1',
    [profesionalId],
  );
  return rows.map((fila) => ({
    diaSemana: fila.dia_semana,
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
  }));
}

/**
 * Lo que impide agendar entre `desde` y `hasta`: bloqueos (del barbero o de todo
 * el negocio) y citas activas del barbero. Una cita `por_aprobar` también cuenta,
 * porque reserva el hueco mientras espera respuesta.
 */
export async function obtenerOcupados(
  tx: Transaccion,
  profesionalId: string,
  desde: Date,
  hasta: Date,
): Promise<Intervalo[]> {
  const { rows } = await tx.consultar<{ inicio: Date; fin: Date }>(
    `SELECT inicio, fin FROM bloqueos
      WHERE (profesional_id = $1 OR profesional_id IS NULL)
        AND inicio < $3 AND fin > $2
     UNION ALL
     SELECT inicio, fin FROM citas
      WHERE profesional_id = $1
        AND estado IN ('por_aprobar', 'pendiente', 'confirmada')
        AND inicio < $3 AND fin > $2`,
    [profesionalId, desde, hasta],
  );
  return rows.map((fila) => ({ inicio: fila.inicio, fin: fila.fin }));
}
