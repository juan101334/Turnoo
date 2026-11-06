import type { Transaccion } from '../../db/contexto.js';
import type { EntradaConocimiento } from './conocimiento.tipos.js';

/** Único lugar con SQL de la base de conocimiento. */

const COLUMNAS = 'id, pregunta, respuesta, activo, created_at, updated_at';

interface FilaEntrada {
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

function aEntrada(f: FilaEntrada): EntradaConocimiento {
  return {
    id: f.id,
    pregunta: f.pregunta,
    respuesta: f.respuesta,
    activo: f.activo,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  };
}

/** Activas primero y, dentro de cada grupo, en el orden en que se escribieron. */
export async function listar(tx: Transaccion): Promise<EntradaConocimiento[]> {
  const { rows } = await tx.consultar<FilaEntrada>(
    `SELECT ${COLUMNAS} FROM conocimiento ORDER BY activo DESC, created_at, id`,
  );
  return rows.map(aEntrada);
}

export async function obtenerBloqueada(tx: Transaccion, id: string): Promise<EntradaConocimiento | null> {
  const { rows } = await tx.consultar<FilaEntrada>(
    `SELECT ${COLUMNAS} FROM conocimiento WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ? aEntrada(rows[0]) : null;
}

/**
 * Bloquea la fila del negocio para que dos cambios simultáneos no pasen juntos los topes: el
 * segundo espera a que el primero termine y cuenta con lo que este dejó. FOR NO KEY UPDATE no
 * frena a quien solo inserta filas que apuntan al negocio, como una cita nueva.
 */
export async function bloquearNegocio(tx: Transaccion, negocioId: string): Promise<void> {
  await tx.consultar('SELECT 1 FROM negocios WHERE id = $1 FOR NO KEY UPDATE', [negocioId]);
}

/**
 * Cuántas entradas hay y cuántos caracteres suman las activas, sin contar `excluirId` (la que se
 * está editando, para sumarla con sus valores nuevos). char_length cuenta caracteres, no bytes.
 */
export async function contar(
  tx: Transaccion,
  excluirId: string | null,
): Promise<{ total: number; caracteresActivos: number }> {
  const { rows } = await tx.consultar<{ total: number; caracteres_activos: number }>(
    `SELECT count(*)::int AS total,
            coalesce(sum(char_length(pregunta) + char_length(respuesta)) FILTER (WHERE activo), 0)::int
              AS caracteres_activos
       FROM conocimiento
      WHERE $1::uuid IS NULL OR id <> $1::uuid`,
    [excluirId],
  );
  return { total: rows[0]!.total, caracteresActivos: rows[0]!.caracteres_activos };
}

/** ¿Ya hay otra entrada con la misma pregunta, sin distinguir mayúsculas? */
export async function existePregunta(tx: Transaccion, pregunta: string, excluirId: string | null): Promise<boolean> {
  const { rows } = await tx.consultar(
    `SELECT 1 FROM conocimiento
      WHERE lower(pregunta) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [pregunta, excluirId],
  );
  return rows.length > 0;
}

export async function crear(
  tx: Transaccion,
  e: { negocioId: string; pregunta: string; respuesta: string; activo: boolean },
): Promise<EntradaConocimiento> {
  const { rows } = await tx.consultar<FilaEntrada>(
    `INSERT INTO conocimiento (negocio_id, pregunta, respuesta, activo)
     VALUES ($1, $2, $3, $4) RETURNING ${COLUMNAS}`,
    [e.negocioId, e.pregunta, e.respuesta, e.activo],
  );
  return aEntrada(rows[0]!);
}

export async function actualizar(
  tx: Transaccion,
  id: string,
  e: { pregunta: string; respuesta: string; activo: boolean },
): Promise<EntradaConocimiento> {
  const { rows } = await tx.consultar<FilaEntrada>(
    `UPDATE conocimiento SET pregunta = $2, respuesta = $3, activo = $4
      WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, e.pregunta, e.respuesta, e.activo],
  );
  return aEntrada(rows[0]!);
}

export async function borrar(tx: Transaccion, id: string): Promise<boolean> {
  const { rowCount } = await tx.consultar('DELETE FROM conocimiento WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
