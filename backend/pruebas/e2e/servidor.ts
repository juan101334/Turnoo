/** Arranca el backend sobre turnoo_test para las pruebas del panel. Uso: npx tsx pruebas/e2e/servidor.ts */
import './entorno.js';

const { pool } = await import('../../src/db/pool.js');
const { rows } = await pool.query<{ base: string }>('SELECT current_database() AS base');
if (!rows[0]?.base.endsWith('_test')) throw new Error(`El backend de e2e solo corre sobre una base "*_test" (esta es "${rows[0]?.base}").`);

await import('../../src/index.js');
