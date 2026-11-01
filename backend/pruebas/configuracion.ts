import { afterAll, beforeAll } from 'vitest';
import { pool } from '../src/db/pool.js';

// Se ejecuta antes de cada archivo de pruebas.
beforeAll(async () => {
  let base = '';
  try {
    const { rows } = await pool.query<{ base: string }>('SELECT current_database() AS base');
    base = rows[0]?.base ?? '';
  } catch (error) {
    throw new Error(
      'No se pudo conectar a la base de pruebas. ¿Corriste "npm run db:pruebas"? ' +
        `Detalle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // Seguro extra: jamás correr las pruebas sobre una base que no sea de pruebas.
  if (!base.endsWith('_test')) {
    throw new Error(`Las pruebas solo pueden correr en una base "*_test" (esta es "${base}").`);
  }
});

afterAll(async () => {
  await pool.end();
});
