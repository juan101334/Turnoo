import type { Transaccion } from '../../db/contexto.js';
import type { Profesional } from './profesionales.tipos.js';

/** Único lugar con SQL del módulo de barberos. */

const COLUMNAS = 'id, sede_id, usuario_id, nombre, activo, created_at';

interface FilaProfesional {
  id: string;
  sede_id: string;
  usuario_id: string | null;
  nombre: string;
  activo: boolean;
  created_at: Date;
}

function aProfesional(f: FilaProfesional): Profesional {
  return {
    id: f.id,
    sedeId: f.sede_id,
    usuarioId: f.usuario_id,
    nombre: f.nombre,
    activo: f.activo,
    createdAt: f.created_at,
  };
}

export async function listar(tx: Transaccion): Promise<Profesional[]> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `SELECT ${COLUMNAS} FROM profesionales ORDER BY activo DESC, nombre, id`,
  );
  return rows.map(aProfesional);
}

export async function obtener(tx: Transaccion, id: string): Promise<Profesional | null> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `SELECT ${COLUMNAS} FROM profesionales WHERE id = $1`,
    [id],
  );
  return rows[0] ? aProfesional(rows[0]) : null;
}

/** Igual que obtener, pero bloquea la fila hasta el final de la transacción. */
export async function obtenerBloqueado(tx: Transaccion, id: string): Promise<Profesional | null> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `SELECT ${COLUMNAS} FROM profesionales WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ? aProfesional(rows[0]) : null;
}

/** El barbero asociado a un usuario, esté activo o no. */
export async function obtenerPorUsuario(tx: Transaccion, usuarioId: string): Promise<Profesional | null> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `SELECT ${COLUMNAS} FROM profesionales WHERE usuario_id = $1`,
    [usuarioId],
  );
  return rows[0] ? aProfesional(rows[0]) : null;
}

/** La sede a la que se agregan barberos: por ahora cada negocio opera con una sola. */
export async function obtenerSedeActiva(tx: Transaccion): Promise<string | null> {
  const { rows } = await tx.consultar<{ id: string }>(
    'SELECT id FROM sedes WHERE activa ORDER BY created_at, id LIMIT 1',
  );
  return rows[0]?.id ?? null;
}

/**
 * Límite de barberos del plan (null = sin límite). Bloquea la fila del negocio para que dos
 * altas simultáneas no pasen el límite. FOR NO KEY UPDATE no estorba a quien solo inserta
 * filas que apuntan al negocio, como una cita nueva; FOR UPDATE sí las haría esperar.
 */
export async function bloquearLimiteDeBarberos(tx: Transaccion, negocioId: string): Promise<number | null> {
  const { rows } = await tx.consultar<{ max_profesionales: number | null }>(
    `SELECT p.max_profesionales
       FROM negocios n LEFT JOIN planes p ON p.id = n.plan_id
      WHERE n.id = $1
        FOR NO KEY UPDATE OF n`,
    [negocioId],
  );
  return rows[0]?.max_profesionales ?? null;
}

export async function contarActivos(tx: Transaccion): Promise<number> {
  const { rows } = await tx.consultar<{ total: number }>(
    'SELECT count(*)::int AS total FROM profesionales WHERE activo',
  );
  return rows[0]!.total;
}

export async function crear(
  tx: Transaccion,
  p: { negocioId: string; sedeId: string; nombre: string },
): Promise<Profesional> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `INSERT INTO profesionales (negocio_id, sede_id, nombre) VALUES ($1, $2, $3) RETURNING ${COLUMNAS}`,
    [p.negocioId, p.sedeId, p.nombre],
  );
  return aProfesional(rows[0]!);
}

export async function cambiarNombre(tx: Transaccion, id: string, nombre: string): Promise<Profesional | null> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `UPDATE profesionales SET nombre = $2 WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, nombre],
  );
  return rows[0] ? aProfesional(rows[0]) : null;
}

export async function cambiarActivo(tx: Transaccion, id: string, activo: boolean): Promise<Profesional> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `UPDATE profesionales SET activo = $2 WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, activo],
  );
  return aProfesional(rows[0]!);
}

export async function asignarUsuario(
  tx: Transaccion,
  id: string,
  usuarioId: string | null,
): Promise<Profesional> {
  const { rows } = await tx.consultar<FilaProfesional>(
    `UPDATE profesionales SET usuario_id = $2 WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, usuarioId],
  );
  return aProfesional(rows[0]!);
}

/** Citas activas del barbero que aún no terminan. */
export async function contarCitasFuturas(tx: Transaccion, id: string, ahora: Date): Promise<number> {
  const { rows } = await tx.consultar<{ total: number }>(
    `SELECT count(*)::int AS total
       FROM citas
      WHERE profesional_id = $1 AND fin > $2
        AND estado IN ('por_aprobar', 'pendiente', 'confirmada')`,
    [id, ahora],
  );
  return rows[0]!.total;
}
