import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser } from '@playwright/test';

/**
 * Capturas del panel para la landing (landing/public/capturas). No es una prueba: solo corre con
 *   CAPTURAS=1 npx playwright test e2e/capturas-landing.spec.ts --project=celular
 * Usa una barbería inventada (backend/pruebas/e2e/sembrar-landing.ts) en turnoo_test: ningún dato
 * es de un cliente real. Siempre en modo claro y al doble de resolución.
 */

const DESTINO = fileURLToPath(new URL('../../landing/public/capturas/', import.meta.url));
/** Angosto a propósito (pero con el menú lateral): así el panel se lee dentro del marco de la landing. */
const ESCRITORIO = { width: 1120, height: 700 };
const CELULAR = { width: 390, height: 780 };

async function sesion(browser: Browser, viewport: { width: number; height: number }, datos: { correo: string; clave: string }) {
  const contexto = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', locale: 'es-CO', isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await contexto.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo').fill(datos.correo);
  await page.getByLabel('Contraseña').fill(datos.clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/hoy');
  const captura = async (nombre: string) => {
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${DESTINO}${nombre}.png` });
  };
  return { page, captura, cerrar: () => contexto.close() };
}

test('capturas del panel para la landing', async ({ browser }) => {
  test.setTimeout(180_000);
  const salida = execFileSync('npx', ['tsx', 'pruebas/e2e/sembrar-landing.ts'], { cwd: fileURLToPath(new URL('../../backend', import.meta.url)), encoding: 'utf8' });
  const datos = JSON.parse(salida.trim().split('\n').at(-1) ?? '') as { correo: string; clave: string; fecha: string };

  const pc = await sesion(browser, ESCRITORIO, datos);
  await pc.page.goto(`/agenda?fecha=${datos.fecha}`);
  await expect(pc.page.getByText('Mateo Giraldo').locator('visible=true').first()).toBeVisible();
  await pc.captura('agenda-escritorio');
  await pc.page.goto('/conocimiento');
  await expect(pc.page.getByText('¿Dónde quedan?').locator('visible=true').first()).toBeVisible();
  await pc.captura('conocimiento-escritorio');
  await pc.cerrar();

  const cel = await sesion(browser, CELULAR, datos);
  await cel.page.goto('/mensajes');
  await expect(cel.page.getByText('Carolina Henao').locator('visible=true').first()).toBeVisible();
  await cel.page.getByRole('link', { name: 'Todas' }).click();
  await expect(cel.page.getByText('Mateo Giraldo').locator('visible=true').first()).toBeVisible();
  await cel.captura('mensajes-celular');
  await cel.page.getByRole('link', { name: /Carolina Henao/ }).first().click();
  await expect(cel.page.getByText('¿Ustedes hacen tintura para hombre?').locator('visible=true').first()).toBeVisible();
  await cel.captura('conversacion-celular');
  await cel.cerrar();
});
