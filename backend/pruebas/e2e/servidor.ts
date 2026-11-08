/**
 * Arranca el backend sobre turnoo_test para las pruebas del panel. Uso: npx tsx pruebas/e2e/servidor.ts
 *
 * Usa la misma app que producción, con dos diferencias para que una prueba nunca toque WhatsApp:
 * - los envíos van a un Meta de mentira (acepta todo, salvo un texto con "FALLA-META", que rechaza);
 * - no arranca las tareas programadas (recordatorios), que sí escribirían a Meta.
 */
import './entorno.js';

const { pool } = await import('../../src/db/pool.js');
const { rows } = await pool.query<{ base: string }>('SELECT current_database() AS base');
if (!rows[0]?.base.endsWith('_test')) throw new Error(`El backend de e2e solo corre sobre una base "*_test" (esta es "${rows[0]?.base}").`);

const { crearApp } = await import('../../src/app.js');
const { entorno } = await import('../../src/config/entorno.js');

let enviados = 0;
const metaDePrueba: typeof fetch = async (url, init) => {
  if (!String(url).startsWith('https://graph.facebook.com/')) throw new Error(`Meta de prueba: URL inesperada ${String(url)}`);
  const cuerpo = typeof init?.body === 'string' ? init.body : '';
  const responder = (estado: number, datos: unknown) => new Response(JSON.stringify(datos), { status: estado, headers: { 'content-type': 'application/json' } });
  if (cuerpo.includes('FALLA-META')) return responder(400, { error: { code: 131030, message: 'Rechazado por el Meta de prueba' } });
  return responder(200, { messaging_product: 'whatsapp', messages: [{ id: `wamid.e2e.${++enviados}` }] });
};

crearApp({ envio: { pedir: metaDePrueba } }).listen(entorno.PORT);
