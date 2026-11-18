/**
 * Imagen para compartir de la landing (landing/app/opengraph-image.png, 1200 x 630): una captura
 * del hero de verdad, sin el encabezado ni los botones. Pasos:
 *   1. En landing/:  npm run build  y servir out/ en el puerto 3210
 *      (por ejemplo: python3 -m http.server 3210 --directory out).
 *   2. En panel/ (aquí está Playwright):  node e2e/imagen-og-landing.mjs
 *   3. Volver a compilar la landing para que tome la imagen nueva.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const navegador = await chromium.launch({ channel: 'chrome' });
const contexto = await navegador.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();
await pagina.goto(process.env.LANDING_URL ?? 'http://127.0.0.1:3210/');
await pagina.waitForLoadState('networkidle');
await pagina.addStyleTag({
  content:
    'header{display:none!important} main>section:first-child{padding-top:44px!important;align-items:start!important} main>section:first-child .boton, main>section:first-child p.mt-4.text-sm{display:none!important}',
});
await pagina.screenshot({ path: fileURLToPath(new URL('../../landing/app/opengraph-image.png', import.meta.url)) });
await navegador.close();
