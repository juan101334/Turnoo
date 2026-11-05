import type { Transaccion } from '../../db/contexto.js';
import type {
  Bloqueo,
  CambiosServicio,
  CitaAfectada,
  EntradaBloqueo,
  EntradaHorario,
  EntradaServicio,
  Horario,
  Servicio,
} from './agenda.tipos.js';

/** Único lugar con SQL de servicios, horarios y bloqueos. */

// ---------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------

const COLUMNAS_SERVICIO = 'id, profesional_id, nombre, duracion_minutos, precio_cop, activo, created_at';

interface FilaServicio {
  id: string;
  profesional_id: string;
  nombre: string;
  duracion_minutos: number;
  precio_cop: number;
  activo: boolean;
  created_at: Date;
}

function aServicio(f: FilaServicio): Servicio {
  return {
    id: f.id,
    profesionalId: f.profesional_id,
    nombre: f.nombre,
    duracionMinutos: f.duracion_minutos,
    precioCop: f.precio_cop,
    activo: f.activo,
    createdAt: f.created_at,
  };
}

export async function listarServicios(tx: Transaccion, profesionalId: string): Promise<Servicio[]> {
  const { rows } = await tx.consultar<FilaServicio>(
    `SELECT ${COLUMNAS_SERVICIO} FROM servicios WHERE profesional_id = $1 ORDER BY activo DESC, nombre, id`,
    [profesionalId],
  );
  return rows.map(aServicio);
}

export async function crearServicio(
  tx: Transaccion,
  negocioId: string,
  profesionalId: string,
  s: EntradaServicio,
): Promise<Servicio> {
  const { rows } = await tx.consultar<FilaServicio>(
    `INSERT INTO servicios (negocio_id, profesional_id, nombre, duracion_minutos, precio_cop)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_SERVICIO}`,
    [negocioId, profesionalId, s.nombre, s.duracionMinutos, s.precioCop],
  );
  return aServicio(rows[0]!);
}

const COLUMNAS_CAMBIO_SERVICIO: Record<keyof EntradaServicio, string> = {
  nombre: 'nombre',
  duracionMinutos: 'duracion_minutos',
  precioCop: 'precio_cop',
};

/** Los nombres de columna salen solo de la lista de arriba; los valores van como parámetros. */
export async function actualizarServicio(
  tx: Transaccion,
  profesionalId: string,
  servicioId: string,
  cambios: CambiosServicio,
): Promise<Servicio | null> {
  const asignaciones: string[] = [];
  const valores: unknown[] = [];
  for (const campo of Object.keys(COLUMNAS_CAMBIO_SERVICIO) as (keyof EntradaServicio)[]) {
    if (cambios[campo] === undefined) continue;
    valores.push(cambios[campo]);
    asignaciones.push(`${COLUMNAS_CAMBIO_SERVICIO[campo]} = $${valores.length + 2}`);
  }
  const { rows } = await tx.consultar<FilaServicio>(
    `UPDATE servicios SET ${asignaciones.join(', ')}
      WHERE id = $1 AND profesional_id = $2 RETURNING ${COLUMNAS_SERVICIO}`,
    [servicioId, profesionalId, ...valores],
  );
  return rows[0] ? aServicio(rows[0]) : null;
}

export async function cambiarServicioActivo(
  tx: Transaccion,
  profesionalId: string,
  servicioId: string,
  activo: boolean,
): Promise<Servicio | null> {
  const { rows } = await tx.consultar<FilaServicio>(
    `UPDATE servicios SET activo = $3 WHERE id = $1 AND profesional_id = $2 RETURNING ${COLUMNAS_SERVICIO}`,
    [servicioId, profesionalId, activo],
  );
  return rows[0] ? aServicio(rows[0]) : null;
}

// ---------------------------------------------------------------------
// Horarios de trabajo
// ---------------------------------------------------------------------

const COLUMNAS_HORARIO = 'id, profesional_id, dia_semana, hora_inicio, hora_fin';

interface FilaHorario {
  id: string;
  profesional_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

function aHorario(f: FilaHorario): Horario {
  return {
    id: f.id,
    profesionalId: f.profesional_id,
    diaSemana: f.dia_semana,
    // PostgreSQL entrega `time` como 'HH:MM:SS'; la API usa 'HH:MM'.
    horaInicio: f.hora_inicio.slice(0, 5),
    horaFin: f.hora_fin.slice(0, 5),
  };
}

export async function listarHorarios(tx: Transaccion, profesionalId: string): Promise<Horario[]> {
  const { rows } = await tx.consultar<FilaHorario>(
    `SELECT ${COLUMNAS_HORARIO} FROM horarios_trabajo
      WHERE profesional_id = $1 ORDER BY dia_semana, hora_inicio`,
    [profesionalId],
  );
  return rows.map(aHorario);
}

export async function crearHorario(
  tx: Transaccion,
  negocioId: string,
  profesionalId: string,
  h: EntradaHorario,
): Promise<Horario> {
  const { rows } = await tx.consultar<FilaHorario>(
    `INSERT INTO horarios_trabajo (negocio_id, profesional_id, dia_semana, hora_inicio, hora_fin)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_HORARIO}`,
    [negocioId, profesionalId, h.diaSemana, h.horaInicio, h.horaFin],
  );
  return aHorario(rows[0]!);
}

export async function eliminarHorario(
  tx: Transaccion,
  profesionalId: string,
  horarioId: string,
): Promise<Horario | null> {
  const { rows } = await tx.consultar<FilaHorario>(
    `DELETE FROM horarios_trabajo WHERE id = $1 AND profesional_id = $2 RETURNING ${COLUMNAS_HORARIO}`,
    [horarioId, profesionalId],
  );
  return rows[0] ? aHorario(rows[0]) : null;
}

// ---------------------------------------------------------------------
// Bloqueos
// ---------------------------------------------------------------------

const COLUMNAS_BLOQUEO = 'id, profesional_id, inicio, fin, motivo';

interface FilaBloqueo {
  id: string;
  profesional_id: string | null;
  inicio: Date;
  fin: Date;
  motivo: string | null;
}

function aBloqueo(f: FilaBloqueo): Bloqueo {
  return { id: f.id, profesionalId: f.profesional_id, inicio: f.inicio, fin: f.fin, motivo: f.motivo };
}

/** Con `profesionalId`: los de ese barbero y los de todo el negocio, que también lo afectan. */
export async function listarBloqueos(
  tx: Transaccion,
  filtro: { desde: Date; hasta: Date; profesionalId: string | null },
): Promise<Bloqueo[]> {
  const { rows } = await tx.consultar<FilaBloqueo>(
    `SELECT ${COLUMNAS_BLOQUEO} FROM bloqueos
      WHERE inicio < $2 AND fin > $1
        AND ($3::uuid IS NULL OR profesional_id = $3 OR profesional_id IS NULL)
      ORDER BY inicio, id`,
    [filtro.desde, filtro.hasta, filtro.profesionalId],
  );
  return rows.map(aBloqueo);
}

export async function obtenerBloqueo(tx: Transaccion, bloqueoId: string): Promise<Bloqueo | null> {
  const { rows } = await tx.consultar<FilaBloqueo>(
    `SELECT ${COLUMNAS_BLOQUEO} FROM bloqueos WHERE id = $1`,
    [bloqueoId],
  );
  return rows[0] ? aBloqueo(rows[0]) : null;
}

export async function crearBloqueo(tx: Transaccion, negocioId: string, b: EntradaBloqueo): Promise<Bloqueo> {
  const { rows } = await tx.consultar<FilaBloqueo>(
    `INSERT INTO bloqueos (negocio_id, profesional_id, inicio, fin, motivo)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_BLOQUEO}`,
    [negocioId, b.profesionalId, b.inicio, b.fin, b.motivo ?? null],
  );
  return aBloqueo(rows[0]!);
}

export async function eliminarBloqueo(tx: Transaccion, bloqueoId: string): Promise<void> {
  await tx.consultar('DELETE FROM bloqueos WHERE id = $1', [bloqueoId]);
}

// ---------------------------------------------------------------------
// Bloqueo de filas y citas afectadas
// ---------------------------------------------------------------------

/**
 * Bloquea a todos los barberos del negocio hasta el final de la transacción. El orden fijo evita
 * bloqueos cruzados. Crear una cita toma FOR SHARE sobre su barbero, así que una cita en curso
 * termina antes de calcular las afectadas, y la siguiente ya ve el cierre nuevo.
 */
export async function bloquearBarberosDelNegocio(tx: Transaccion): Promise<void> {
  await tx.consultar('SELECT id FROM profesionales ORDER BY id FOR UPDATE');
}

/**
 * Citas activas que aún no terminan y se cruzan con [desde, hasta). `hasta` null = sin final.
 * `profesionalId` null = de todos los barberos del negocio.
 */
export async function citasActivasEnRango(
  tx: Transaccion,
  filtro: { profesionalId: string | null; desde: Date; hasta: Date | null },
): Promise<CitaAfectada[]> {
  const { rows } = await tx.consultar<{
    id: string;
    profesional_id: string;
    inicio: Date;
    fin: Date;
    estado: string;
    cliente_nombre: string | null;
    cliente_telefono: string;
  }>(
    `SELECT c.id, c.profesional_id, c.inicio, c.fin, c.estado,
            cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono
       FROM citas c JOIN clientes cl ON cl.id = c.cliente_id
      WHERE c.estado IN ('por_aprobar', 'pendiente', 'confirmada')
        AND c.fin > $1
        AND ($2::timestamptz IS NULL OR c.inicio < $2)
        AND ($3::uuid IS NULL OR c.profesional_id = $3)
      ORDER BY c.inicio, c.id`,
    [filtro.desde, filtro.hasta, filtro.profesionalId],
  );
  return rows.map((f) => ({
    id: f.id,
    profesionalId: f.profesional_id,
    inicio: f.inicio,
    fin: f.fin,
    estado: f.estado,
    clienteNombre: f.cliente_nombre,
    clienteTelefono: f.cliente_telefono,
  }));
}
