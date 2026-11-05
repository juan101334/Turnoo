import type { Transaccion } from '../../db/contexto.js';
import type { CambiosCliente, Cliente, ClienteDeWhatsapp, ClienteResumen, FiltroClientes } from './clientes.tipos.js';

/** Espacio de los candados de clientes; no choca con el de las tareas (7001). */
const ESPACIO_CANDADO_CLIENTE = 7002;

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

interface FilaWhatsapp {
  id: string;
  nombre: string | null;
  telefono: string | null;
  wa_user_id: string | null;
}

const COLUMNAS_WHATSAPP = 'id, nombre, telefono, wa_user_id';

const aClienteDeWhatsapp = (f: FilaWhatsapp, creado: boolean): ClienteDeWhatsapp => ({
  id: f.id,
  nombre: f.nombre,
  telefono: f.telefono,
  waUserId: f.wa_user_id,
  creado,
});

async function buscarPor(tx: Transaccion, columna: 'telefono' | 'wa_user_id', valor: string): Promise<FilaWhatsapp | null> {
  const { rows } = await tx.consultar<FilaWhatsapp>(
    `SELECT ${COLUMNAS_WHATSAPP} FROM clientes WHERE ${columna} = $1 FOR UPDATE`,
    [valor],
  );
  return rows[0] ?? null;
}

/**
 * Busca o crea al cliente que escribe por WhatsApp. Llega con teléfono, con BSUID o con ambos
 * (al menos uno). El BSUID manda: es la identidad de la cuenta de WhatsApp.
 *
 * 1. Por BSUID: si existe, es ese cliente. Se completa el teléfono si le faltaba y nadie más lo usa.
 * 2. Por teléfono: si existe sin BSUID, es ese cliente y se le guarda el BSUID. Si tiene OTRO
 *    BSUID, el número pasó a otra persona (WhatsApp recicla números): se le quita el teléfono al
 *    cliente viejo y se crea uno nuevo, para que la persona nueva no vea las citas de la anterior.
 * 3. Si no aparece, se crea.
 *
 * Los candados (por BSUID y por teléfono, siempre en ese orden para no trabarse entre sí) evitan
 * que dos mensajes simultáneos de la misma persona creen dos clientes. Un choque por teléfono con
 * el panel, que no toma el candado, termina en error de UNIQUE: el webhook responde 500, Meta lo
 * reenvía y en el segundo intento el cliente ya existe.
 */
export async function obtenerOCrearPorWhatsapp(
  tx: Transaccion,
  negocioId: string,
  identidad: { telefono: string | null; waUserId: string | null },
  nombre: string | null,
): Promise<ClienteDeWhatsapp> {
  const { telefono, waUserId } = identidad;
  if (telefono === null && waUserId === null) throw new Error('obtenerOCrearPorWhatsapp: falta teléfono o BSUID');

  for (const clave of [waUserId && `bsuid:${waUserId}`, telefono && `telefono:${telefono}`]) {
    if (!clave) continue;
    await tx.consultar('SELECT pg_advisory_xact_lock($1::int, hashtext($2))', [ESPACIO_CANDADO_CLIENTE, `${negocioId}:${clave}`]);
  }

  if (waUserId !== null) {
    const porBsuid = await buscarPor(tx, 'wa_user_id', waUserId);
    if (porBsuid) {
      const completarTelefono =
        telefono !== null && porBsuid.telefono === null && (await buscarPor(tx, 'telefono', telefono)) === null;
      const { rows } = await tx.consultar<FilaWhatsapp>(
        `UPDATE clientes SET nombre = COALESCE(nombre, $2), telefono = COALESCE(telefono, $3)
          WHERE id = $1 RETURNING ${COLUMNAS_WHATSAPP}`,
        [porBsuid.id, nombre, completarTelefono ? telefono : null],
      );
      return aClienteDeWhatsapp(rows[0]!, false);
    }
  }

  if (telefono !== null) {
    const porTelefono = await buscarPor(tx, 'telefono', telefono);
    if (porTelefono && (porTelefono.wa_user_id === null || waUserId === null)) {
      const { rows } = await tx.consultar<FilaWhatsapp>(
        `UPDATE clientes SET nombre = COALESCE(nombre, $2), wa_user_id = COALESCE(wa_user_id, $3)
          WHERE id = $1 RETURNING ${COLUMNAS_WHATSAPP}`,
        [porTelefono.id, nombre, waUserId],
      );
      return aClienteDeWhatsapp(rows[0]!, false);
    }
    if (porTelefono) {
      // Tiene su propio BSUID, así que sigue siendo un cliente válido sin teléfono.
      await tx.consultar('UPDATE clientes SET telefono = NULL WHERE id = $1', [porTelefono.id]);
    }
  }

  const { rows } = await tx.consultar<FilaWhatsapp>(
    `INSERT INTO clientes (negocio_id, telefono, wa_user_id, nombre) VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNAS_WHATSAPP}`,
    [negocioId, telefono, waUserId, nombre],
  );
  return aClienteDeWhatsapp(rows[0]!, true);
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
    'UPDATE clientes SET nombre = NULL, telefono = NULL, wa_user_id = NULL, notas = NULL, anonimizado_en = now() WHERE id = $1',
    [clienteId],
  );
}
