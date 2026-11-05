import type { Transaccion } from '../../db/contexto.js';
import type { CambiosCliente, Cliente, ClienteResumen, FiltroClientes } from './clientes.tipos.js';

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

const COLUMNAS = 'id, nombre, telefono, notas, anonimizado_en, created_at';

interface FilaCliente {
  id: string;
  nombre: string | null;
  telefono: string | null;
  notas: string | null;
  anonimizado_en: Date | null;
  created_at: Date;
}

function aCliente(f: FilaCliente): Cliente {
  return {
    id: f.id,
    nombre: f.nombre,
    telefono: f.telefono,
    notas: f.notas,
    anonimizadoEn: f.anonimizado_en,
    createdAt: f.created_at,
  };
}

/** Evita que un % o un _ escritos por el usuario actúen como comodines de LIKE. */
function textoLiteralParaLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}

/** Un cliente anonimizado ya no es nadie a quien buscar: no aparece en la lista. */
export async function listar(tx: Transaccion, filtro: FiltroClientes): Promise<Cliente[]> {
  // Solo se busca por teléfono si el texto parece uno: "Ana 3" no debe traer todo número con un 3.
  const digitos = filtro.buscar && /^[\d\s().+-]+$/.test(filtro.buscar) ? filtro.buscar.replace(/\D/g, '') : '';
  const { rows } = await tx.consultar<FilaCliente>(
    `SELECT ${COLUMNAS}
       FROM clientes cl
      WHERE cl.anonimizado_en IS NULL
        AND ($1::uuid IS NULL
             OR EXISTS (SELECT 1 FROM citas c WHERE c.cliente_id = cl.id AND c.profesional_id = $1))
        AND ($2::text IS NULL OR cl.nombre ILIKE $2 OR cl.telefono LIKE $3::text)
      ORDER BY cl.nombre NULLS LAST, cl.id
      LIMIT $4 OFFSET $5`,
    [
      filtro.profesionalId,
      filtro.buscar === null ? null : `%${textoLiteralParaLike(filtro.buscar)}%`,
      digitos ? `%${digitos}%` : null,
      filtro.limite,
      filtro.desplazamiento,
    ],
  );
  return rows.map(aCliente);
}

export async function obtener(tx: Transaccion, clienteId: string): Promise<Cliente | null> {
  const { rows } = await tx.consultar<FilaCliente>(`SELECT ${COLUMNAS} FROM clientes WHERE id = $1`, [clienteId]);
  return rows[0] ? aCliente(rows[0]) : null;
}

export async function obtenerBloqueado(tx: Transaccion, clienteId: string): Promise<Cliente | null> {
  const { rows } = await tx.consultar<FilaCliente>(
    `SELECT ${COLUMNAS} FROM clientes WHERE id = $1 FOR UPDATE`,
    [clienteId],
  );
  return rows[0] ? aCliente(rows[0]) : null;
}

export async function tieneCitasConBarbero(
  tx: Transaccion,
  clienteId: string,
  profesionalId: string,
): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    'SELECT 1 FROM citas WHERE cliente_id = $1 AND profesional_id = $2 LIMIT 1',
    [clienteId, profesionalId],
  );
  return (rowCount ?? 0) > 0;
}

export async function actualizar(tx: Transaccion, clienteId: string, cambios: CambiosCliente): Promise<Cliente> {
  const asignaciones: string[] = [];
  const valores: unknown[] = [];
  for (const campo of ['nombre', 'telefono', 'notas'] as const) {
    if (cambios[campo] === undefined) continue;
    valores.push(cambios[campo]);
    asignaciones.push(`${campo} = $${valores.length + 1}`);
  }
  const { rows } = await tx.consultar<FilaCliente>(
    `UPDATE clientes SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING ${COLUMNAS}`,
    [clienteId, ...valores],
  );
  return aCliente(rows[0]!);
}

/**
 * Cuenta toda cita en un estado activo, también si su hora ya pasó: mientras siga activa
 * puede reprogramarse, y el negocio necesitaría el teléfono para contactar al cliente.
 */
export async function contarCitasActivas(tx: Transaccion, clienteId: string): Promise<number> {
  const { rows } = await tx.consultar<{ total: number }>(
    `SELECT count(*)::int AS total FROM citas
      WHERE cliente_id = $1 AND estado IN ('por_aprobar', 'pendiente', 'confirmada')`,
    [clienteId],
  );
  return rows[0]!.total;
}

/**
 * Borra todo lo que identifica al cliente y conserva sus citas sin datos personales, para que
 * el negocio mantenga su historial. Borrar la conversación borra en cascada sus mensajes y
 * derivaciones. El registro de `consentimientos` se conserva como prueba de la autorización.
 */
export async function anonimizar(tx: Transaccion, clienteId: string): Promise<void> {
  await tx.consultar('UPDATE citas SET notas = NULL WHERE cliente_id = $1 AND notas IS NOT NULL', [clienteId]);
  await tx.consultar('DELETE FROM conversaciones WHERE cliente_id = $1', [clienteId]);
  await tx.consultar(
    'UPDATE clientes SET nombre = NULL, telefono = NULL, notas = NULL, anonimizado_en = now() WHERE id = $1',
    [clienteId],
  );
}
