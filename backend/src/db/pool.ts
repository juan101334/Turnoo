import pg from 'pg';
import { entorno } from '../config/entorno.js';
import { logger } from '../compartido/logger.js';

/**
 * Conexión a PostgreSQL con el rol de la aplicación (turnoo_app).
 * No se usa directamente fuera de src/db/: el resto del código entra
 * por conNegocio() o conSistema() (ver contexto.ts).
 */
export const pool = new pg.Pool({
  connectionString: entorno.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Error inesperado en una conexión inactiva de la base de datos');
});
