import type { Transaccion } from '../../db/contexto.js';
import type { ClienteResumen } from './clientes.tipos.js';

/**
 * Busca al cliente por teléfono dentro del negocio y, si no existe, lo crea.
 * Una sola sentencia: dos peticiones a la vez con el mismo teléfono no crean dos clientes.
 * Si ya existía sin nombre y ahora llega uno, se completa; un nombre existente no se pisa.
 */
export async function obtenerOCrear(
  tx: Transaccion,
  negocioId: string,
  telefono: string,
  nombre: string | null,
): Promise<ClienteResumen> {
  const { rows } = await tx.consultar<ClienteResumen>(
    `INSERT INTO clientes (negocio_id, telefono, nombre) VALUES ($1, $2, $3)
     ON CONFLICT (negocio_id, telefono)
     DO UPDATE SET nombre = COALESCE(clientes.nombre, EXCLUDED.nombre)
     RETURNING id, nombre, telefono, (xmax = 0) AS creado`,
    [negocioId, telefono, nombre],
  );
  return rows[0]!;
}
