/**
 * Aplica las migraciones pendientes a la base de DATABASE_URL (backend/.env), con el usuario
 * administrador POSTGRES_USER / POSTGRES_PASSWORD (.env de la raíz).
 *
 * Uso:
 *   npm run db:migrar                          aplica las pendientes, en orden
 *   npm run db:migrar -- --estado              solo muestra aplicadas y pendientes
 *   npm run db:migrar -- --registrar-hasta 013 anota 001..013 como aplicadas sin ejecutarlas
 *                                              (una sola vez, para una base migrada a mano)
 */
import pg from 'pg';
import { aplicarPendientes, conexionAdmin, ErrorDeMigracion, estado, registrarHasta } from './migraciones.js';

const argumentos = process.argv.slice(2);
const USO = 'Uso: npm run db:migrar [-- --estado | -- --registrar-hasta NNN]';

let cliente: pg.Client | undefined;
try {
  const config = conexionAdmin();
  cliente = new pg.Client(config);
  await cliente.connect();
  console.log(`Base: ${config.database}`);

  if (argumentos.length === 0) {
    const hechas = await aplicarPendientes(cliente, undefined, (archivo) => console.log(`  aplicada: ${archivo}`));
    console.log(hechas.length === 0 ? 'No hay migraciones pendientes.' : `Listo: ${hechas.length} aplicada(s).`);
  } else if (argumentos.length === 1 && argumentos[0] === '--estado') {
    const e = await estado(cliente);
    console.log(`Aplicadas (${e.aplicadas.length}): ${e.aplicadas.join(', ') || 'ninguna'}`);
    console.log(`Pendientes (${e.pendientes.length}): ${e.pendientes.join(', ') || 'ninguna'}`);
    if (e.migradaAMano) {
      console.log('Ojo: la base tiene tablas pero ninguna migración anotada. Anota las que ya aplicaste con --registrar-hasta NNN.');
    }
  } else if (argumentos.length === 2 && argumentos[0] === '--registrar-hasta' && /^\d{1,3}$/.test(argumentos[1]!)) {
    const anotadas = await registrarHasta(cliente, Number(argumentos[1]));
    console.log(`Anotadas sin ejecutar (${anotadas.length}): ${anotadas.join(', ')}`);
  } else {
    throw new ErrorDeMigracion(USO);
  }
} catch (error) {
  const detalle = error instanceof Error ? error.message : String(error);
  console.error(error instanceof ErrorDeMigracion ? detalle : `No se pudo migrar: ${detalle}`);
  process.exitCode = 1;
} finally {
  await cliente?.end();
}
