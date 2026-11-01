import { randomUUID } from 'node:crypto';
import { conNegocio, conSistema } from '../src/db/contexto.js';

/**
 * Ayudas para armar datos de prueba. Cada archivo de pruebas crea sus propios
 * negocios (con ids al azar) y los borra al terminar con limpiar(): al borrar
 * un negocio, la base elimina en cascada todo lo que colgaba de él.
 */

export interface NegocioDePrueba {
  negocioId: string;
  sedeId: string;
}

export type EstadoCita =
  | 'por_aprobar'
  | 'pendiente'
  | 'confirmada'
  | 'completada'
  | 'cancelada'
  | 'no_asistio';

const negociosCreados: string[] = [];

/** Fecha fija en el futuro, para que las pruebas no dependan del día en que corren. */
export function hora(hhmm: string, dia = '2030-06-10'): Date {
  return new Date(`${dia}T${hhmm}:00Z`);
}

export async function crearNegocio(nombre = 'Barbería de prueba'): Promise<NegocioDePrueba> {
  const negocioId = randomUUID();
  const sedeId = await conSistema(async (tx) => {
    await tx.consultar('INSERT INTO negocios (id, nombre) VALUES ($1, $2)', [negocioId, nombre]);
    // La base crea sola la "Sede principal" al insertar el negocio.
    const { rows } = await tx.consultar<{ id: string }>(
      'SELECT id FROM sedes WHERE negocio_id = $1',
      [negocioId],
    );
    return rows[0]!.id;
  });
  negociosCreados.push(negocioId);
  return { negocioId, sedeId };
}

export async function crearProfesional(n: NegocioDePrueba, nombre = 'Barbero'): Promise<string> {
  const id = randomUUID();
  await conNegocio(n.negocioId, (tx) =>
    tx.consultar(
      'INSERT INTO profesionales (id, negocio_id, sede_id, nombre) VALUES ($1, $2, $3, $4)',
      [id, n.negocioId, n.sedeId, nombre],
    ),
  );
  return id;
}

export async function crearServicio(
  n: NegocioDePrueba,
  profesionalId: string,
  nombre = 'Corte',
  duracionMinutos = 30,
  precioCop = 20000,
): Promise<string> {
  const id = randomUUID();
  await conNegocio(n.negocioId, (tx) =>
    tx.consultar(
      `INSERT INTO servicios (id, negocio_id, profesional_id, nombre, duracion_minutos, precio_cop)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, n.negocioId, profesionalId, nombre, duracionMinutos, precioCop],
    ),
  );
  return id;
}

export async function crearCliente(n: NegocioDePrueba, nombre = 'Cliente'): Promise<string> {
  const id = randomUUID();
  const telefono = '57' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
  await conNegocio(n.negocioId, (tx) =>
    tx.consultar(
      'INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)',
      [id, n.negocioId, nombre, telefono],
    ),
  );
  return id;
}

export interface DatosCita {
  profesionalId: string;
  clienteId: string;
  inicio: Date;
  fin: Date;
  estado?: EstadoCita;
}

export async function crearCita(n: NegocioDePrueba, datos: DatosCita): Promise<string> {
  const id = randomUUID();
  const estado = datos.estado ?? 'pendiente';
  await conNegocio(n.negocioId, (tx) =>
    tx.consultar(
      `INSERT INTO citas (id, negocio_id, sede_id, profesional_id, cliente_id, inicio, fin,
                          estado, cancelada_en, cancelada_por, aprobacion_expira_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text,
               CASE WHEN $8::text = 'cancelada' THEN now() END,
               CASE WHEN $8::text = 'cancelada' THEN 'negocio' END,
               CASE WHEN $8::text = 'por_aprobar' THEN now() + interval '2 hours' END)`,
      [id, n.negocioId, n.sedeId, datos.profesionalId, datos.clienteId, datos.inicio, datos.fin, estado],
    ),
  );
  return id;
}

export function cambiarEstado(n: NegocioDePrueba, citaId: string, estado: EstadoCita) {
  return conNegocio(n.negocioId, (tx) =>
    tx.consultar(
      `UPDATE citas
          SET estado = $2::text,
              cancelada_en = CASE WHEN $2::text = 'cancelada' THEN now() END,
              cancelada_por = CASE WHEN $2::text = 'cancelada' THEN 'negocio' END
        WHERE id = $1`,
      [citaId, estado],
    ),
  );
}

/** Borra los negocios creados en este archivo de pruebas (y todo lo que colgaba de ellos). */
export async function limpiar(): Promise<void> {
  if (negociosCreados.length === 0) return;
  await conSistema((tx) =>
    tx.consultar('DELETE FROM negocios WHERE id = ANY($1::uuid[])', [negociosCreados]),
  );
  negociosCreados.length = 0;
}
