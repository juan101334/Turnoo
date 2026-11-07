/**
 * Control de las migraciones aplicadas. Cada migración de db/migrations/ se aplica una sola vez,
 * en orden, y queda anotada en la tabla migraciones_aplicadas con la huella (sha256) del archivo.
 *
 * Reglas:
 * - El nombre es NNN_descripcion.sql y el número define el orden.
 * - Cada archivo tiene una línea "BEGIN;" y termina con una línea "COMMIT;". Aquí se quitan esas
 *   dos líneas para aplicar el cuerpo y anotarlo en la MISMA transacción: si algo falla, no queda
 *   ni el cambio a medias ni la anotación.
 * - Una migración aplicada no se edita: si su huella cambió, se detiene todo. Lo mismo si falta
 *   un archivo ya aplicado o si aparece uno nuevo con número menor que el último aplicado.
 *
 * Lo usan `npm run db:migrar` (scripts/migrar.ts) y `npm run db:pruebas`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const NOMBRE_VALIDO = /^(\d{3})_[a-z0-9_]+\.sql$/;
/** Candado de sesión: dos ejecuciones a la vez sobre la misma base esperan una a la otra. */
const CANDADO = [7002, 1] as const;

export class ErrorDeMigracion extends Error {}

export interface Migracion {
  archivo: string;
  numero: number;
  huella: string;
  cuerpo: string;
}

/** Conexión de administrador al servidor de DATABASE_URL (backend/.env) con POSTGRES_USER/PASSWORD (.env de la raíz). */
export function conexionAdmin(database?: string): pg.ClientConfig {
  const { DATABASE_URL, POSTGRES_USER, POSTGRES_PASSWORD } = process.env;
  if (!DATABASE_URL || !POSTGRES_USER || !POSTGRES_PASSWORD) {
    throw new ErrorDeMigracion('Faltan variables: DATABASE_URL (backend/.env) y POSTGRES_USER / POSTGRES_PASSWORD (.env de la raíz).');
  }
  const servidor = new URL(DATABASE_URL);
  return {
    host: servidor.hostname,
    port: Number(servidor.port || 5432),
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: database ?? decodeURIComponent(servidor.pathname.slice(1)),
  };
}

/** Quita las líneas "BEGIN;" y "COMMIT;" del archivo, después de comprobar que lo envuelven todo. */
export function cuerpoSinTransaccion(archivo: string, sql: string): string {
  const lineas = sql.split(/\r?\n/);
  const inicios = lineas.flatMap((l, i) => (l.trim() === 'BEGIN;' ? [i] : []));
  const finales = lineas.flatMap((l, i) => (l.trim() === 'COMMIT;' ? [i] : []));
  const ultimaConTexto = lineas.findLastIndex((l) => l.trim() !== '');
  const inicio = inicios[0];
  const fin = finales[0];
  if (inicios.length !== 1 || finales.length !== 1 || inicio === undefined || fin === undefined || fin !== ultimaConTexto) {
    throw new ErrorDeMigracion(`${archivo}: debe tener una sola línea "BEGIN;" y terminar con una sola línea "COMMIT;".`);
  }
  const antes = lineas.slice(0, inicio).filter((l) => l.trim() !== '' && !l.trim().startsWith('--'));
  if (antes.length > 0) {
    throw new ErrorDeMigracion(`${archivo}: antes de "BEGIN;" solo puede haber comentarios.`);
  }
  return lineas.slice(inicio + 1, fin).join('\n');
}

export function leerMigraciones(carpeta = CARPETA_MIGRACIONES): Migracion[] {
  const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.sql')).sort();
  const migraciones = archivos.map((archivo) => {
    const coincide = NOMBRE_VALIDO.exec(archivo);
    if (!coincide) throw new ErrorDeMigracion(`${archivo}: el nombre debe ser NNN_descripcion.sql (minúsculas, números y _).`);
    const contenido = readFileSync(join(carpeta, archivo));
    return {
      archivo,
      numero: Number(coincide[1]),
      huella: createHash('sha256').update(contenido).digest('hex'),
      cuerpo: cuerpoSinTransaccion(archivo, contenido.toString('utf8')),
    };
  });
  for (let i = 1; i < migraciones.length; i++) {
    if (migraciones[i]!.numero === migraciones[i - 1]!.numero) {
      throw new ErrorDeMigracion(`${migraciones[i - 1]!.archivo} y ${migraciones[i]!.archivo} tienen el mismo número.`);
    }
  }
  return migraciones;
}

/** Qué falta aplicar, o por qué no se puede seguir. `aplicadas`: archivo → huella anotada. */
export function pendientes(migraciones: Migracion[], aplicadas: Map<string, string>): Migracion[] {
  const enCarpeta = new Map(migraciones.map((m) => [m.archivo, m]));
  for (const [archivo, huella] of aplicadas) {
    const migracion = enCarpeta.get(archivo);
    if (!migracion) throw new ErrorDeMigracion(`${archivo} está aplicada pero ya no está en la carpeta.`);
    if (migracion.huella !== huella) {
      throw new ErrorDeMigracion(`${archivo} cambió después de aplicarse. Una migración aplicada no se edita: crea una nueva.`);
    }
  }
  const ultima = Math.max(0, ...migraciones.filter((m) => aplicadas.has(m.archivo)).map((m) => m.numero));
  const faltan = migraciones.filter((m) => !aplicadas.has(m.archivo));
  const atrasada = faltan.find((m) => m.numero < ultima);
  if (atrasada) {
    throw new ErrorDeMigracion(`${atrasada.archivo} no está aplicada y tiene un número menor que la última aplicada. Renómbrala con un número mayor.`);
  }
  return faltan;
}

async function existeRegistro(cliente: pg.Client): Promise<boolean> {
  const { rows } = await cliente.query<{ existe: boolean }>(`SELECT to_regclass('public.migraciones_aplicadas') IS NOT NULL AS existe`);
  return rows[0]!.existe;
}

/** La tabla es solo del administrador: la aplicación (turnoo_app) no la lee ni la cambia. */
async function crearRegistro(cliente: pg.Client): Promise<void> {
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      archivo           text PRIMARY KEY,
      huella            text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
      aplicada_en       timestamptz NOT NULL DEFAULT now(),
      solo_registrada   boolean NOT NULL DEFAULT false
    );
    COMMENT ON TABLE migraciones_aplicadas IS
      'Migraciones de db/migrations aplicadas (npm run db:migrar). solo_registrada: se aplicó a mano antes de este control.';
    REVOKE ALL ON TABLE migraciones_aplicadas FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnoo_app') THEN
        REVOKE ALL ON TABLE migraciones_aplicadas FROM turnoo_app;
      END IF;
    END $$;
  `);
}

async function leerAplicadas(cliente: pg.Client): Promise<Map<string, string>> {
  if (!(await existeRegistro(cliente))) return new Map();
  const { rows } = await cliente.query<{ archivo: string; huella: string }>('SELECT archivo, huella FROM migraciones_aplicadas');
  return new Map(rows.map((f) => [f.archivo, f.huella]));
}

async function conCandado<T>(cliente: pg.Client, trabajo: () => Promise<T>): Promise<T> {
  await cliente.query('SELECT pg_advisory_lock($1, $2)', [...CANDADO]);
  try {
    return await trabajo();
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1, $2)', [...CANDADO]);
  }
}

export interface Estado {
  aplicadas: string[];
  pendientes: string[];
  /** Tiene tablas pero ninguna migración anotada: se migró a mano y falta --registrar-hasta. */
  migradaAMano: boolean;
}

async function migradaAMano(cliente: pg.Client, aplicadas: Map<string, string>): Promise<boolean> {
  if (aplicadas.size > 0) return false;
  const { rows } = await cliente.query<{ hay: boolean }>(`SELECT to_regclass('public.negocios') IS NOT NULL AS hay`);
  return rows[0]!.hay;
}

/** Solo lee: no crea la tabla ni aplica nada. */
export async function estado(cliente: pg.Client, carpeta = CARPETA_MIGRACIONES): Promise<Estado> {
  const migraciones = leerMigraciones(carpeta);
  const aplicadas = await leerAplicadas(cliente);
  return {
    aplicadas: [...aplicadas.keys()].sort(),
    pendientes: pendientes(migraciones, aplicadas).map((m) => m.archivo),
    migradaAMano: await migradaAMano(cliente, aplicadas),
  };
}

/** Aplica en orden las que faltan, cada una con su anotación en una sola transacción. */
export async function aplicarPendientes(
  cliente: pg.Client,
  carpeta = CARPETA_MIGRACIONES,
  alAplicar: (archivo: string) => void = () => {},
): Promise<string[]> {
  const migraciones = leerMigraciones(carpeta);
  return conCandado(cliente, async () => {
    const aplicadas = await leerAplicadas(cliente);
    const faltan = pendientes(migraciones, aplicadas);
    if (faltan.length > 0 && (await migradaAMano(cliente, aplicadas))) {
      throw new ErrorDeMigracion(
        'Esta base ya tiene tablas pero ninguna migración anotada: se aplicaron a mano. ' +
          'Anota las que ya tiene con --registrar-hasta NNN (la última que aplicaste).',
      );
    }
    await crearRegistro(cliente);
    const hechas: string[] = [];
    for (const m of faltan) {
      await cliente.query('BEGIN');
      try {
        await cliente.query(m.cuerpo);
        await cliente.query('INSERT INTO migraciones_aplicadas (archivo, huella) VALUES ($1, $2)', [m.archivo, m.huella]);
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        const detalle = error instanceof Error ? error.message : String(error);
        throw new ErrorDeMigracion(`${m.archivo} falló y no se aplicó nada de ella: ${detalle}`);
      }
      hechas.push(m.archivo);
      alAplicar(m.archivo);
    }
    return hechas;
  });
}

/**
 * Para una base a la que se le aplicaron migraciones a mano antes de este control: anota como
 * aplicadas las de número menor o igual a `hasta`, sin ejecutarlas. Solo con el registro vacío.
 */
export async function registrarHasta(cliente: pg.Client, hasta: number, carpeta = CARPETA_MIGRACIONES): Promise<string[]> {
  const migraciones = leerMigraciones(carpeta).filter((m) => m.numero <= hasta);
  if (!migraciones.some((m) => m.numero === hasta)) {
    throw new ErrorDeMigracion(`No hay una migración con el número ${String(hasta).padStart(3, '0')}.`);
  }
  return conCandado(cliente, async () => {
    if ((await leerAplicadas(cliente)).size > 0) {
      throw new ErrorDeMigracion('El registro ya tiene migraciones anotadas: --registrar-hasta solo sirve la primera vez.');
    }
    await crearRegistro(cliente);
    await cliente.query('BEGIN');
    try {
      for (const m of migraciones) {
        await cliente.query('INSERT INTO migraciones_aplicadas (archivo, huella, solo_registrada) VALUES ($1, $2, true)', [m.archivo, m.huella]);
      }
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    }
    return migraciones.map((m) => m.archivo);
  });
}
