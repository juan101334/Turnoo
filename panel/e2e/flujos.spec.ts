import { expect, test, type Page } from '@playwright/test';
import { alerta, datos, entrar, entrarYEsperar } from './datos';

/**
 * Los flujos que más usan el barbero y el dueño, en celular y en escritorio (los dos proyectos de
 * playwright.config.ts). Cada proyecto usa su propia cita (ver sembrar.ts), así no se pisan.
 */

const esEscritorio = (nombre: string) => nombre === 'escritorio';
const tarjeta = (page: Page, cliente: string) => page.getByRole('link', { name: new RegExp(cliente) });

test.describe('flujos principales', () => {
  test('login: con una contraseña equivocada el correo se queda escrito; con la buena entra a Hoy', async ({ page }) => {
    await entrar(page, datos().empleado, 'no-es-la-clave-123');
    await expect(alerta(page)).toContainText('El correo o la contraseña no son correctos.');
    await expect(page.getByLabel('Correo')).toHaveValue(datos().empleado);

    await page.getByLabel('Contraseña').fill(datos().clave);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/hoy');
    await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  });

  test('el menú: barra inferior en el celular, lateral agrupado en el escritorio', async ({ page }, info) => {
    await entrarYEsperar(page, datos().dueno);
    const menu = page.getByRole('navigation', { name: 'Principal' });
    if (esEscritorio(info.project.name)) {
      for (const grupo of ['Día a día', 'Clientes y equipo', 'Negocio']) await expect(menu.getByText(grupo, { exact: true })).toBeVisible();
      await expect(menu.getByRole('link', { name: 'Cuenta' })).toBeVisible();
      await expect(menu.getByRole('link', { name: 'Más' })).toHaveCount(0);
      await expect(page.getByRole('img', { name: 'Turnoo' })).toBeVisible();
    } else {
      await expect(menu.getByRole('link', { name: 'Más' })).toBeVisible();
      await menu.getByRole('link', { name: 'Más' }).click();
      for (const grupo of ['Clientes y equipo', 'Negocio', 'Cuenta']) await expect(page.getByRole('heading', { name: grupo })).toBeVisible();
    }
  });

  test('Hoy se vuelve a pedir solo cada minuto, sin recargar la página', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().empleado);
    // Que la página ya esté interactiva (el reloj del refresco arranca al hidratarse).
    await page.waitForLoadState('networkidle');
    const refresco = page.waitForRequest((r) => r.url().includes('/hoy') && r.headers()['rsc'] === '1', { timeout: 10_000 });
    await page.clock.fastForward('01:05');
    await refresco;
    await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  });

  test('Hoy: el dueño abre una cita que ya empezó y la marca como completada', async ({ page }, info) => {
    const cliente = esEscritorio(info.project.name) ? 'Cliente Flujo Escritorio' : 'Cliente Flujo Celular';
    await entrarYEsperar(page, datos().dueno);
    await tarjeta(page, cliente).click();
    await expect(page).toHaveTitle(new RegExp(`${cliente} · Turnoo`));
    await page.getByRole('button', { name: 'Completada', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cita marcada como completada.' })).toBeVisible();
    await expect(page.locator('section').getByText('Completada', { exact: true })).toBeVisible();
  });

  test('Nueva cita: el botón principal lleva al formulario y agenda con el backend', async ({ page }, info) => {
    await entrarYEsperar(page, datos().empleado);
    await page.getByRole('link', { name: 'Nueva cita' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva cita' })).toBeVisible();
    await page.getByRole('link', { name: 'Cliente nuevo' }).click();
    await page.getByRole('checkbox', { name: /Corte/ }).check();
    await page.getByRole('button', { name: 'Ver horas libres' }).click();
    // Esperar a que el día elegido quede en la URL: si no, se marcaría una hora del día anterior.
    const dia5 = page.getByRole('navigation', { name: 'Días' }).getByRole('link').nth(5);
    const destino5 = (await dia5.getAttribute('href'))!;
    await dia5.click();
    await expect(page).toHaveURL(destino5);
    // La primera hora libre de ese día: otras pruebas pueden haber ocupado o bloqueado alguna.
    // Dentro de main: el selector de tema del menú lateral también tiene radios.
    const primera = page.locator('main label').filter({ has: page.getByRole('radio') }).first();
    const hora = ((await primera.textContent()) ?? '').trim();
    await primera.click();
    await page.getByLabel('Teléfono del cliente').fill(esEscritorio(info.project.name) ? '300 555 0202' : '300 555 0303');
    await page.getByRole('button', { name: 'Agendar cita' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cita agendada.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(hora);
  });
});

test.describe('marca e instalación', () => {
  test('el login muestra el logo y la página enlaza favicon, ícono de Apple y manifiesto', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('img', { name: 'Turnoo' })).toBeVisible();
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  });

  test('el manifiesto se puede instalar: íconos de 192 y 512, normales y maskable, sin sesión', async ({ request }) => {
    const respuesta = await request.get('/manifest.webmanifest');
    expect(respuesta.ok()).toBe(true);
    const manifiesto = await respuesta.json();
    expect(manifiesto).toMatchObject({ name: 'Turnoo', display: 'standalone', start_url: '/', theme_color: '#075985' });
    const iconos: { src: string; sizes: string; purpose: string }[] = manifiesto.icons;
    expect(iconos.map((i) => `${i.sizes} ${i.purpose}`).sort()).toEqual(['192x192 any', '192x192 maskable', '512x512 any', '512x512 maskable']);
    for (const icono of iconos) {
      const imagen = await request.get(icono.src);
      expect(imagen.headers()['content-type']).toBe('image/png');
      // Ancho y alto reales del PNG (cabecera IHDR, bytes 16 a 23).
      const bytes = await imagen.body();
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icono.sizes);
    }
  });
});
