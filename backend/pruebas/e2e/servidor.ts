/**
 * Arranca el backend sobre turnoo_test para las pruebas del panel. Uso: npx tsx pruebas/e2e/servidor.ts
 *
 * Usa la misma app que producción, con dos diferencias para que una prueba nunca toque WhatsApp:
 * - los envíos van a un Meta de mentira (acepta todo, salvo un texto con "FALLA-META", que rechaza);
 * - no arranca las tareas programadas (recordatorios), que sí escribirían a Meta.
 * Además trae un freno para las pruebas de las pantallas de carga (ver /__e2e/ más abajo).
 */
import { createServer } from 'node:http';
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

/**
 * Freno para las pruebas de los esqueletos de carga (e2e/esqueletos.spec.ts del panel): con
 * POST /__e2e/retener?ruta=/clientes, las GET que empiezan por esa ruta esperan hasta
 * POST /__e2e/soltar. Así el panel muestra su pantalla de carga el tiempo que la prueba necesite.
 * Solo existe en este servidor de pruebas.
 */
let retenida: string | null = null;
let soltar: () => void = () => {};
let suelta = Promise.resolve();
const coincide = (camino: string, ruta: string) => camino === ruta || camino.startsWith(`${ruta}?`) || camino.startsWith(`${ruta}/`);

const app = crearApp({ envio: { pedir: metaDePrueba } });
createServer((req, res) => {
  const camino = req.url ?? '/';
  if (req.method === 'POST' && camino.startsWith('/__e2e/')) {
    const url = new URL(camino, 'http://e2e');
    if (url.pathname === '/__e2e/retener' && url.searchParams.get('ruta')?.startsWith('/')) {
      retenida = url.searchParams.get('ruta');
      suelta = new Promise((r) => (soltar = r));
    } else if (url.pathname === '/__e2e/soltar') {
      retenida = null;
      soltar();
    } else {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET' && retenida && coincide(camino, retenida)) {
    void suelta.then(() => app(req, res));
    return;
  }
  app(req, res);
}).listen(entorno.PORT);
