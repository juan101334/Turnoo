import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * Menú lateral plegable del escritorio (componentes/navegacion.tsx) y los tres anchos estándar de
 * las páginas (globals.css).
 */

test.beforeEach(({}, info) => test.skip(info.project.name !== 'escritorio', 'Solo en el escritorio'));

const menuLateral = (page: Page) => page.locator('aside');
const anchoDelMenu = async (page: Page) => (await menuLateral(page).boundingBox())!.width;
const cookieDelMenu = async (page: Page) => (await page.context().cookies()).find((c) => c.name === 'turnoo_menu')?.value;

test.describe('menú plegable', () => {
  test('se pliega a solo íconos, y queda así al recargar desde el primer render', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    const menu = page.getByRole('navigation', { name: 'Principal' });
    expect(await anchoDelMenu(page)).toBe(240);

    const plegar = page.getByRole('button', { name: 'Plegar menú' });
    await expect(plegar).toHaveAttribute('aria-expanded', 'true');
    await plegar.click();
    await expect.poll(() => anchoDelMenu(page)).toBe(64);
    await expect(menu.getByText('Día a día', { exact: true })).toBeHidden();
    // Queda el isotipo (las dos «o»); el logo completo no cabe.
    await expect(menuLateral(page).getByRole('img', { name: 'Turnoo' })).toHaveAttribute('viewBox', /^-259 /);
    expect(await cookieDelMenu(page)).toBe('plegado');
    // Los enlaces siguen nombrados para el lector de pantalla y se pueden usar.
    await menu.getByRole('link', { name: 'Clientes' }).click();
    await expect(page).toHaveURL('/clientes');
    await expect.poll(() => anchoDelMenu(page)).toBe(64);

    // El servidor ya lo manda plegado: no se abre y se cierra al cargar.
    const html = await (await page.request.get('/hoy')).text();
    expect(html).toMatch(/<aside data-plegado=""/);
    await page.reload();
    expect(await anchoDelMenu(page)).toBe(64);

    const abrir = page.getByRole('button', { name: 'Abrir menú' });
    await expect(abrir).toHaveAttribute('aria-expanded', 'false');
    await abrir.click();
    await expect.poll(() => anchoDelMenu(page)).toBe(240);
    await expect(menu.getByText('Día a día', { exact: true })).toBeVisible();
    expect(await cookieDelMenu(page)).toBeUndefined();
    await page.reload();
    expect(await anchoDelMenu(page)).toBe(240);
  });

  test('plegado, el nombre aparece al pasar el mouse o al llegar con el teclado, y Escape lo cierra', async ({ page }) => {
    await page.context().addCookies([{ name: 'turnoo_menu', value: 'plegado', url: 'http://localhost:3101' }]);
    await entrarYEsperar(page, datos().dueno);
    const menu = page.getByRole('navigation', { name: 'Principal' });
    const rotulo = page.locator('[data-rotulo]');

    await menu.getByRole('link', { name: 'Agenda' }).hover();
    await expect(rotulo).toHaveText('Agenda');
    // Al lado del enlace, fuera del menú: no lo tapa ni lo recorta el scroll.
    const enlace = (await menu.getByRole('link', { name: 'Agenda' }).boundingBox())!;
    const caja = (await rotulo.boundingBox())!;
    expect(caja.x).toBeGreaterThanOrEqual(64);
    expect(Math.abs(caja.y + caja.height / 2 - (enlace.y + enlace.height / 2))).toBeLessThan(2);
    // Se puede pasar el mouse al nombre sin que desaparezca.
    await rotulo.hover();
    await expect(rotulo).toBeVisible();
    await page.mouse.move(800, 500);
    await expect(rotulo).toHaveCount(0);

    await menu.getByRole('link', { name: 'Clientes' }).focus();
    await expect(rotulo).toHaveText('Clientes');
    await page.keyboard.press('Escape');
    await expect(rotulo).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Clientes' })).toBeFocused();

    // El botón de abrir también se nombra.
    await page.getByRole('button', { name: 'Abrir menú' }).hover();
    await expect(rotulo).toHaveText('Abrir menú');
  });

  test('abierto no hay nombre flotante: el nombre ya se ve', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Agenda' }).hover();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-rotulo]')).toHaveCount(0);
  });
});

test('anchos estándar: todas las páginas arrancan en el mismo borde, con su ancho', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  // El contenedor de cada página es el padre del título.
  const medir = async (ruta: string) => {
    await page.goto(ruta);
    const titulo = page.getByRole('heading', { level: 1 }).first();
    await expect(titulo).toBeVisible();
    const caja = (await titulo.boundingBox())!;
    const contenedor = await page.locator('#contenido > div > *').last().boundingBox();
    return { x: Math.round(caja.x), ancho: Math.round(contenedor!.width) };
  };
  const hoy = await medir('/hoy');
  const cuenta = await medir('/cuenta');
  const usuarios = await medir('/usuarios');
  const ajustes = await medir('/negocio');
  const clientes = await medir('/clientes');
  for (const otra of [cuenta, usuarios, ajustes, clientes]) expect(otra.x).toBe(hoy.x);
  expect(cuenta.ancho).toBe(672);
  for (const lista of [usuarios, ajustes, clientes]) expect(lista.ancho).toBe(1024);
  expect(hoy.ancho).toBeGreaterThan(1024);

  // En una pantalla más ancha que el marco (1440 px), el contenido sigue pegado al menú: 240 px
  // del menú más 40 de margen, sin hueco que crezca con la pantalla.
  await page.setViewportSize({ width: 1920, height: 1000 });
  for (const ruta of ['/hoy', '/cuenta']) expect((await medir(ruta)).x).toBe(280);
});
