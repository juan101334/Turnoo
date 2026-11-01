import type { QueryResult, QueryResultRow } from 'pg';
import { traducirErrorPostgres } from '../compartido/errores.js';
import { esUuid } from '../compartido/validacion.js';
import { pool } from './pool.js';

/**
 * AISLAMIENTO ENTRE NEGOCIOS
 *
 * Todo acceso a datos de un negocio pasa por conNegocio(). Abre una
 * transacción y fija `app.negocio_id` antes de cualquier consulta; con eso,
 * Row Level Security en PostgreSQL deja ver y escribir solo las filas de
 * ese negocio. Si el código olvida un filtro, la base de datos igual protege.
 */

/** Lo único que reciben los repositorios para hablar con la base. */
export interface Transaccion {
  consultar<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    parametros?: unknown[],
  ): Promise<QueryResult<T>>;
}

async function ejecutar<T>(
  ajustes: Record<string, string>,
  trabajo: (tx: Transaccion) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const [clave, valor] of Object.entries(ajustes)) {
      // El tercer parámetro `true` limita el ajuste a esta transacción.
      await cliente.query('SELECT set_config($1, $2, true)', [clave, valor]);
    }
    const resultado = await trabajo({
      consultar: (sql, parametros) => cliente.query(sql, parametros),
    });
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw traducirErrorPostgres(error);
  } finally {
    cliente.release();
  }
}

/** Ejecuta `trabajo` dentro de una transacción limitada a UN negocio. */
export function conNegocio<T>(
  negocioId: string,
  trabajo: (tx: Transaccion) => Promise<T>,
): Promise<T> {
  if (!esUuid(negocioId)) {
    throw new Error('conNegocio: el id del negocio no es un uuid válido');
  }
  return ejecutar({ 'app.negocio_id': negocioId }, trabajo);
}

/**
 * Ejecuta `trabajo` con visibilidad sobre TODOS los negocios.
 * Solo para el superadmin y las tareas programadas. Úsalo únicamente
 * cuando de verdad haya que cruzar negocios.
 */
export function conSistema<T>(trabajo: (tx: Transaccion) => Promise<T>): Promise<T> {
  return ejecutar({ 'app.es_sistema': 'true' }, trabajo);
}
