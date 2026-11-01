/**
 * Crea (o recrea desde cero) la base "turnoo_test" y le aplica todas las
 * migraciones de db/migrations/ en orden. Nunca toca la base "turnoo".
 *
 * Uso:  npm run db:pruebas
 * Usa el servidor de DATABASE_URL (backend/.env) y las credenciales de
 * administrador POSTGRES_USER / POSTGRES_PASSWORD (.env de la raíz).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BASE_PRUEBAS = 'turnoo_test';

const { DATABASE_URL, POSTGRES_USER, POSTGRES_PASSWORD } = process.env;
if (!DATABASE_URL || !POSTGRES_USER || !POSTGRES_PASSWORD) {
  console.error(
    'Faltan variables: DATABASE_URL (backend/.env) y POSTGRES_USER / POSTGRES_PASSWORD (.env de la raíz).',
  );
  process.exit(1);
}

const servidor = new URL(DATABASE_URL);
const conexion = (database: string) => ({
  host: servidor.hostname,
  port: Number(servidor.port || 5432),
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  database,
});

const carpeta = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const archivos = readdirSync(carpeta)
  .filter((nombre) => /^\d+_.+\.sql$/.test(nombre))
  .sort();

try {
  const admin = new pg.Client(conexion('postgres'));
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE_PRUEBAS} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE_PRUEBAS}`);
  await admin.end();
  console.log(`Base ${BASE_PRUEBAS} creada.`);

  const cliente = new pg.Client(conexion(BASE_PRUEBAS));
  await cliente.connect();
  for (const archivo of archivos) {
    await cliente.query(readFileSync(carpeta + archivo, 'utf8'));
    console.log(`  migración aplicada: ${archivo}`);
  }
  await cliente.end();
  console.log('Lista. Ahora puedes correr: npm test');
} catch (error) {
  console.error('No se pudo preparar la base de pruebas:', error instanceof Error ? error.message : error);
  process.exit(1);
}
