import type { Transaccion } from '../../db/contexto.js';
import {
  ESTADOS_ACTIVOS,
  type Cita,
  type CitaDeLista,
  type CitaDetalle,
  type EstadoCita,
  type FiltroCitas,
  type HorarioTrabajo,
  type Intervalo,
  type ReglasDeAgenda,
  type ServicioDeCita,
} from './citas.tipos.js';

/** Único lugar con SQL del módulo de citas. Recibe la transacción ya limitada a un negocio. */

export async function obtenerReglasDeAgenda(
  tx: Transaccion,
  negocioId: string,
): Promise<ReglasDeAgenda | null> {
  const { rows } = await tx.consultar<{
    zona_horaria: string;
    estado: string;
    intervalo_minutos: number;
    anticipacion_min_minutos: number;
    anticipacion_max_dias: number;
    max_citas_activas_cliente: number | null;
    horas_limite_cancelacion: number;
    max_inasistencias: number;
    ventana_inasistencias_dias: number;
    horas_espera_aprobacion: number;
    aprobacion_minutos_antes_cita: number;
    max_citas_mes: number | null;
  }>(
    `SELECT n.zona_horaria, n.estado, c.intervalo_minutos, c.anticipacion_min_minutos,
            c.anticipacion_max_dias, c.max_citas_activas_cliente, c.horas_limite_cancelacion,
            c.max_inasistencias, c.ventana_inasistencias_dias, c.horas_espera_aprobacion,
            c.aprobacion_minutos_antes_cita, p.max_citas_mes
       FROM negocios n
       JOIN configuracion_negocio c ON c.negocio_id = n.id
       LEFT JOIN planes p ON p.id = n.plan_id
      WHERE n.id = $1`,
    [negocioId],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    zonaHoraria: f.zona_horaria,
    estadoNegocio: f.estado,
    intervaloMinutos: f.intervalo_minutos,
    anticipacionMinMinutos: f.anticipacion_min_minutos,
    anticipacionMaxDias: f.anticipacion_max_dias,
    maxCitasActivasCliente: f.max_citas_activas_cliente,
    horasLimiteCancelacion: f.horas_limite_cancelacion,
    maxInasistencias: f.max_inasistencias,
    ventanaInasistenciasDias: f.ventana_inasistencias_dias,
    horasEsperaAprobacion: f.horas_espera_aprobacion,
    aprobacionMinutosAntesCita: f.aprobacion_minutos_antes_cita,
    maxCitasMes: f.max_citas_mes,
  };
}

/** Sede del barbero si existe y está activo; null si no. */
export async function obtenerProfesionalActivo(
  tx: Transaccion,
  profesionalId: string,
): Promise<{ sedeId: string } | null> {
  const { rows } = await tx.consultar<{ sede_id: string }>(
    'SELECT sede_id FROM profesionales WHERE id = $1 AND activo',
    [profesionalId],
  );
  return rows[0] ? { sedeId: rows[0].sede_id } : null;
}

/**
 * Igual, para quien va a escribir una cita. FOR SHARE mantiene la fila bloqueada hasta el final de
 * la transacción: quien desactiva al barbero espera, y así cuenta también esta cita.
 */
export async function bloquearProfesionalActivo(
  tx: Transaccion,
  profesionalId: string,
): Promise<{ sedeId: string } | null> {
  const { rows } = await tx.consultar<{ sede_id: string }>(
    'SELECT sede_id FROM profesionales WHERE id = $1 AND activo FOR SHARE',
    [profesionalId],
  );
  return rows[0] ? { sedeId: rows[0].sede_id } : null;
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
 * porque reserva el hueco mientras espera respuesta. `excluirCitaId` ignora una cita
 * (la que se está reprogramando, para que no choque consigo misma).
 */
export async function obtenerOcupados(
  tx: Transaccion,
  profesionalId: string,
  desde: Date,
  hasta: Date,
  excluirCitaId: string | null = null,
): Promise<Intervalo[]> {
  const { rows } = await tx.consultar<{ inicio: Date; fin: Date }>(
    `SELECT inicio, fin FROM bloqueos
      WHERE (profesional_id = $1 OR profesional_id IS NULL)
        AND inicio < $3 AND fin > $2
     UNION ALL
     SELECT inicio, fin FROM citas
      WHERE profesional_id = $1
        AND estado IN ('por_aprobar', 'pendiente', 'confirmada')
        AND ($4::uuid IS NULL OR id <> $4)
        AND inicio < $3 AND fin > $2`,
    [profesionalId, desde, hasta, excluirCitaId],
  );
  return rows.map((fila) => ({ inicio: fila.inicio, fin: fila.fin }));
}

/**
 * ¿Se le puede agendar a este cliente? Un anonimizado ya no tiene teléfono. El bloqueo FOR SHARE
 * hace esperar a una anonimización en curso, que a su vez ve esta cita si llega después.
 */
export async function bloquearClienteVigente(tx: Transaccion, clienteId: string): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    'SELECT 1 FROM clientes WHERE id = $1 AND anonimizado_en IS NULL FOR SHARE',
    [clienteId],
  );
  return (rowCount ?? 0) > 0;
}

/** Citas del cliente que ocupan hueco y todavía no terminaron. */
export async function contarCitasActivas(
  tx: Transaccion,
  clienteId: string,
  ahora: Date,
): Promise<number> {
  const { rows } = await tx.consultar<{ total: number }>(
    `SELECT count(*)::int AS total FROM citas
      WHERE cliente_id = $1 AND estado = ANY($2::text[]) AND fin > $3`,
    [clienteId, ESTADOS_ACTIVOS, ahora],
  );
  return rows[0]?.total ?? 0;
}

export async function contarInasistencias(
  tx: Transaccion,
  clienteId: string,
  desde: Date,
): Promise<number> {
  const { rows } = await tx.consultar<{ total: number }>(
    "SELECT count(*)::int AS total FROM citas WHERE cliente_id = $1 AND estado = 'no_asistio' AND inicio >= $2",
    [clienteId, desde],
  );
  return rows[0]?.total ?? 0;
}

const COLUMNAS_CITA =
  'id, profesional_id, cliente_id, inicio, fin, estado, precio_total_cop, aprobacion_expira_en';

interface FilaCita {
  id: string;
  profesional_id: string;
  cliente_id: string;
  inicio: Date;
  fin: Date;
  estado: EstadoCita;
  precio_total_cop: number;
  aprobacion_expira_en: Date | null;
}

function aCita(f: FilaCita): Cita {
  return {
    id: f.id,
    profesionalId: f.profesional_id,
    clienteId: f.cliente_id,
    inicio: f.inicio,
    fin: f.fin,
    estado: f.estado,
    precioTotalCop: f.precio_total_cop,
    aprobacionExpiraEn: f.aprobacion_expira_en,
  };
}

export interface NuevaCita {
  sedeId: string;
  profesionalId: string;
  clienteId: string;
  inicio: Date;
  fin: Date;
  estado: 'pendiente' | 'por_aprobar';
  aprobacionExpiraEn: Date | null;
  precioTotalCop: number;
  notas: string | null;
  origen: 'whatsapp' | 'panel';
  creadaPorUsuarioId: string | null;
  /** Cuándo se agenda: decide si el recordatorio llega a tiempo. */
  programadaEn: Date;
}

/** Inserta la cita. Si el hueco se ocupó entre tanto, la base lanza 23P01 (→ HorarioNoDisponible). */
export async function insertarCita(
  tx: Transaccion,
  negocioId: string,
  c: NuevaCita,
): Promise<Cita> {
  const { rows } = await tx.consultar<FilaCita>(
    `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin, estado,
                        aprobacion_expira_en, precio_total_cop, notas, origen, creada_por_usuario_id, programada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${COLUMNAS_CITA}`,
    [negocioId, c.sedeId, c.profesionalId, c.clienteId, c.inicio, c.fin, c.estado,
     c.aprobacionExpiraEn, c.precioTotalCop, c.notas, c.origen, c.creadaPorUsuarioId, c.programadaEn],
  );
  return aCita(rows[0]!);
}

/** Copia nombre, duración y precio de cada servicio a la cita, en el orden recibido. */
export async function insertarServiciosDeCita(
  tx: Transaccion,
  negocioId: string,
  citaId: string,
  profesionalId: string,
  servicioIds: string[],
): Promise<void> {
  await tx.consultar(
    `INSERT INTO cita_servicios (cita_id, servicio_id, negocio_id, profesional_id,
                                 nombre, duracion_minutos, precio_cop, orden)
     SELECT $1, s.id, $2, $3, s.nombre, s.duracion_minutos, s.precio_cop, o.orden::smallint
       FROM unnest($4::uuid[]) WITH ORDINALITY AS o(id, orden)
       JOIN servicios s ON s.id = o.id`,
    [citaId, negocioId, profesionalId, servicioIds],
  );
}

/** Suma 1 a las citas del mes y devuelve el total. Atómico: dos citas a la vez no se pisan. */
export async function incrementarUsoDeCitas(
  tx: Transaccion,
  negocioId: string,
  periodo: string,
): Promise<number> {
  const { rows } = await tx.consultar<{ citas_creadas: number }>(
    `INSERT INTO uso_mensual (negocio_id, periodo, citas_creadas) VALUES ($1, $2::date, 1)
     ON CONFLICT (negocio_id, periodo)
     DO UPDATE SET citas_creadas = uso_mensual.citas_creadas + 1
     RETURNING citas_creadas`,
    [negocioId, periodo],
  );
  return rows[0]!.citas_creadas;
}

/** Lee la cita y la bloquea hasta terminar la transacción (dos cambios a la vez no se pisan). */
export async function obtenerCitaParaActualizar(
  tx: Transaccion,
  citaId: string,
): Promise<Cita | null> {
  const { rows } = await tx.consultar<FilaCita>(
    `SELECT ${COLUMNAS_CITA} FROM citas WHERE id = $1 FOR UPDATE`,
    [citaId],
  );
  return rows[0] ? aCita(rows[0]) : null;
}

export async function cancelar(
  tx: Transaccion,
  citaId: string,
  por: 'cliente' | 'negocio',
  ahora: Date,
): Promise<Cita> {
  const { rows } = await tx.consultar<FilaCita>(
    `UPDATE citas SET estado = 'cancelada', cancelada_por = $2, cancelada_en = $3,
                      aprobacion_expira_en = NULL
      WHERE id = $1 RETURNING ${COLUMNAS_CITA}`,
    [citaId, por, ahora],
  );
  return aCita(rows[0]!);
}

/**
 * Cancela las `por_aprobar` vencidas, lo que libera su hueco. Mismo límite que aprobarCita: al
 * llegar el plazo ya no se puede aprobar. SKIP LOCKED: lo que un barbero esté cambiando en este
 * momento no se toca, y si sigue vencido sale en el siguiente ciclo.
 */
export async function expirarPorAprobar(tx: Transaccion, ahora: Date, limite: number): Promise<number> {
  const { rowCount } = await tx.consultar(
    `WITH vencidas AS (
       SELECT id FROM citas
        WHERE estado = 'por_aprobar' AND aprobacion_expira_en <= $1
        ORDER BY aprobacion_expira_en, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE citas c
        SET estado = 'cancelada', cancelada_por = 'sistema', cancelada_en = $1, aprobacion_expira_en = NULL
       FROM vencidas v
      WHERE c.id = v.id`,
    [ahora, limite],
  );
  return rowCount ?? 0;
}

/**
 * Completa las citas que nadie marcó según las horas configuradas por cada negocio. Como esas
 * horas siempre son mayores que cero, `fin <= ahora` descarta casi todo usando el índice.
 */
export async function autocompletarVencidas(tx: Transaccion, ahora: Date, limite: number): Promise<number> {
  const { rowCount } = await tx.consultar(
    `WITH vencidas AS (
       SELECT c.id FROM citas c
         JOIN configuracion_negocio cfg ON cfg.negocio_id = c.negocio_id
        WHERE c.estado IN ('pendiente', 'confirmada')
          AND c.fin <= $1
          AND c.fin + make_interval(hours => cfg.horas_autocompletar_cita) <= $1
        ORDER BY c.fin, c.id
        LIMIT $2
        FOR UPDATE OF c SKIP LOCKED
     )
     UPDATE citas c SET estado = 'completada' FROM vencidas v WHERE c.id = v.id`,
    [ahora, limite],
  );
  return rowCount ?? 0;
}

/** Cambia el estado (aprobar, completar, no asistió). Un trigger de la base valida la transición. */
export async function cambiarEstado(
  tx: Transaccion,
  citaId: string,
  estado: Exclude<EstadoCita, 'cancelada' | 'por_aprobar'>,
): Promise<Cita> {
  const { rows } = await tx.consultar<FilaCita>(
    `UPDATE citas SET estado = $2, aprobacion_expira_en = NULL
      WHERE id = $1 RETURNING ${COLUMNAS_CITA}`,
    [citaId, estado],
  );
  return aCita(rows[0]!);
}

export async function reprogramar(
  tx: Transaccion,
  citaId: string,
  inicio: Date,
  fin: Date,
  ahora: Date,
): Promise<Cita> {
  // Nueva hora, nuevo recordatorio: se vuelve a calcular desde cero.
  const { rows } = await tx.consultar<FilaCita>(
    `UPDATE citas SET inicio = $2, fin = $3, programada_en = $4, recordatorio_enviado_en = NULL,
                      recordatorio_resultado = NULL, recordatorio_intentos = 0, recordatorio_reservado_hasta = NULL
      WHERE id = $1 RETURNING ${COLUMNAS_CITA}`,
    [citaId, inicio, fin, ahora],
  );
  return aCita(rows[0]!);
}

const DETALLE_SQL = `
  SELECT c.id, c.profesional_id, c.cliente_id, c.inicio, c.fin, c.estado, c.precio_total_cop,
         c.aprobacion_expira_en, c.notas,
         cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono, p.nombre AS profesional_nombre,
         COALESCE((SELECT json_agg(json_build_object('servicioId', s.servicio_id,
                                                     'nombre', s.nombre,
                                                     'duracionMinutos', s.duracion_minutos,
                                                     'precioCop', s.precio_cop) ORDER BY s.orden)
                     FROM cita_servicios s WHERE s.cita_id = c.id), '[]'::json) AS servicios
    FROM citas c
    JOIN clientes cl ON cl.id = c.cliente_id
    JOIN profesionales p ON p.id = c.profesional_id`;

interface FilaDetalle extends FilaCita {
  notas: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  profesional_nombre: string;
  servicios: CitaDetalle['servicios'];
}

function aDetalle(f: FilaDetalle): CitaDetalle {
  return {
    ...aCita(f),
    notas: f.notas,
    clienteNombre: f.cliente_nombre,
    clienteTelefono: f.cliente_telefono,
    profesionalNombre: f.profesional_nombre,
    servicios: f.servicios,
  };
}

export const LIMITE_LISTA_CITAS = 500;

export async function listarCitas(tx: Transaccion, f: FiltroCitas): Promise<CitaDeLista[]> {
  // El historial va en un LATERAL: usa citas_cliente_inicio_idx y cuenta TODAS las citas del
  // cliente, no solo las del rango listado. Sin historial, $5 es false y no se calcula nada.
  const { rows } = await tx.consultar<FilaDetalle & { completadas: number | null; inasistencias: number | null }>(
    `SELECT d.*, h.completadas, h.inasistencias
       FROM (${DETALLE_SQL}
              WHERE c.inicio >= $1 AND c.inicio < $2
                AND ($3::uuid IS NULL OR c.profesional_id = $3)
                AND ($4::text[] IS NULL OR c.estado = ANY($4))
              ORDER BY c.inicio, c.id
              LIMIT ${LIMITE_LISTA_CITAS}) d
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE x.estado = 'completada')::int AS completadas,
                count(*) FILTER (WHERE x.estado = 'no_asistio')::int AS inasistencias
           FROM citas x
          WHERE x.cliente_id = d.cliente_id AND ($6::uuid IS NULL OR x.profesional_id = $6)
       ) h ON $5
      ORDER BY d.inicio, d.id`,
    [f.desde, f.hasta, f.profesionalId ?? null, f.estados ?? null, f.historial !== undefined, f.historial?.profesionalId ?? null],
  );
  return rows.map((fila) => {
    const cita: CitaDeLista = aDetalle(fila);
    if (f.historial) {
      cita.clienteCitasCompletadas = fila.completadas ?? 0;
      cita.clienteInasistencias = fila.inasistencias ?? 0;
    }
    return cita;
  });
}

/**
 * Citas por día local del negocio entre dos instantes, sin las canceladas. Agrupa en la base (usa
 * citas_negocio_inicio_idx con el negocio de la RLS) y no tiene el LIMIT de la lista: es un número
 * por día, no las citas.
 */
export async function contarCitasPorDia(
  tx: Transaccion,
  f: { desde: Date; hasta: Date; zonaHoraria: string; profesionalId: string | null },
): Promise<{ fecha: string; citas: number }[]> {
  const { rows } = await tx.consultar<{ fecha: string; citas: number }>(
    `SELECT to_char(c.inicio AT TIME ZONE $3, 'YYYY-MM-DD') AS fecha, count(*)::int AS citas
       FROM citas c
      WHERE c.inicio >= $1 AND c.inicio < $2 AND c.estado <> 'cancelada'
        AND ($4::uuid IS NULL OR c.profesional_id = $4)
      GROUP BY 1
      ORDER BY 1`,
    [f.desde, f.hasta, f.zonaHoraria, f.profesionalId],
  );
  return rows;
}

/** Citas activas de un cliente que aún no terminan, de la más próxima a la más lejana. */
export async function listarActivasDelCliente(tx: Transaccion, clienteId: string, ahora: Date): Promise<CitaDetalle[]> {
  const { rows } = await tx.consultar<FilaDetalle>(
    `${DETALLE_SQL}
      WHERE c.cliente_id = $1 AND c.fin > $2 AND c.estado = ANY($3)
      ORDER BY c.inicio, c.id`,
    [clienteId, ahora, ESTADOS_ACTIVOS],
  );
  return rows.map(aDetalle);
}

/**
 * Historial de un cliente, de la cita más reciente a la más vieja. Con `profesionalId`, solo las de
 * ese barbero (el empleado no ve las citas que el cliente tuvo con otros).
 */
export async function listarCitasDelCliente(
  tx: Transaccion,
  clienteId: string,
  f: { profesionalId: string | null; limite: number; desplazamiento: number },
): Promise<CitaDetalle[]> {
  const { rows } = await tx.consultar<FilaDetalle>(
    `${DETALLE_SQL}
      WHERE c.cliente_id = $1 AND ($2::uuid IS NULL OR c.profesional_id = $2)
      ORDER BY c.inicio DESC, c.id DESC
      LIMIT $3 OFFSET $4`,
    [clienteId, f.profesionalId, f.limite, f.desplazamiento],
  );
  return rows.map(aDetalle);
}

export async function obtenerCitaDetalle(tx: Transaccion, citaId: string): Promise<CitaDetalle | null> {
  const { rows } = await tx.consultar<FilaDetalle>(`${DETALLE_SQL} WHERE c.id = $1`, [citaId]);
  return rows[0] ? aDetalle(rows[0]) : null;
}

/** Barbero asociado a un usuario del panel (un empleado solo ve la agenda de ESE barbero). */
export async function profesionalDeUsuario(tx: Transaccion, usuarioId: string): Promise<string | null> {
  const { rows } = await tx.consultar<{ id: string }>(
    'SELECT id FROM profesionales WHERE usuario_id = $1 AND activo',
    [usuarioId],
  );
  return rows[0]?.id ?? null;
}
