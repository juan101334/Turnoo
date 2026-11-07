/**
 * Crea (o recrea desde cero) la base "turnoo_test" y le aplica todas las
 * migraciones de db/migrations/ en orden, con el mismo control que
 * `npm run db:migrar`. Nunca toca la base "turnoo".
 *
 * Uso:  npm run db:pruebas
 * Usa el servidor de DATABASE_URL (backend/.env) y las credenciales de
 * administrador POSTGRES_USER / POSTGRES_PASSWORD (.env de la raíz).
 */
import pg from 'pg';
import { aplicarPendientes, conexionAdmin } from './migraciones.js';

const BASE_PRUEBAS = 'turnoo_test';

try {
  const admin = new pg.Client(conexionAdmin('postgres'));
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE_PRUEBAS} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE_PRUEBAS}`);
  await admin.end();
  console.log(`Base ${BASE_PRUEBAS} creada.`);

  const cliente = new pg.Client(conexionAdmin(BASE_PRUEBAS));
  await cliente.connect();
  try {
    await aplicarPendientes(cliente, undefined, (archivo) => console.log(`  migración aplicada: ${archivo}`));
  } finally {
    await cliente.end();
  }
  console.log('Lista. Ahora puedes correr: npm test');
} catch (error) {
  console.error('No se pudo preparar la base de pruebas:', error instanceof Error ? error.message : error);
  process.exit(1);
}
