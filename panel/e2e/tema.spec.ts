import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * Tema Sistema / Claro / Oscuro: se elige en Cuenta, en el menú lateral, en Más (celular) y en la
 * barra del superadmin; se guarda en la cookie turnoo_tema y el servidor lo pinta desde el primer
 * HTML, sin destello.
 */

const CLARO = 'rgb(245, 247, 249)';
const OSCURO = 'rgb(11, 20, 29)';
const fondo = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const cookieTema = async (page: Page) => (await page.context().cookies()).find((c) => c.name === 'turnoo_tema')?.value;
const esCelular = (proyecto: string) => proyecto === 'celular';

/** Todos los colores del panel, para comparar los dos bloques del modo oscuro de globals.css. */
const colores = (page: Page) =>
  page.evaluate(() => {
    const estilo = getComputedStyle(document.documentElement);
    const nombres = new Set<string>();
    for (const hoja of Array.from(document.styleSheets)) {
      try {
        for (const regla of Array.from(hoja.cssRules)) {
          const texto = regla.cssText;
          for (const m of texto.matchAll(/(--color-[a-z-]+|--shadow-flotante)\s*:/g)) nombres.add(m[1]!);
        }
      } catch {
        // Hojas de otro origen: no tienen variables del panel.
      }
    }
    return Object.fromEntries([...nombres].sort().map((n) => [n, estilo.getPropertyValue(n).trim()]));
  });

test.describe('tema', () => {
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Cuenta y Más: en el celular'));

  test('elegir Oscuro en Cuenta cambia al instante, se guarda y el servidor lo pinta al recargar', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/cuenta');
    const tema = page.getByRole('group', { name: 'Tema' });
    await expect(tema.getByRole('radio', { name: 'Sistema' })).toBeChecked();
    expect(await fondo(page)).toBe(CLARO);

    await tema.getByText('Oscuro').click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await expect.poll(() => fondo(page)).toBe(OSCURO);
    expect(await cookieTema(page)).toBe('oscuro');
    // La barra del navegador toma el color del tema elegido (un solo theme-color, sin media).
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b141d');

    // El primer HTML ya trae el tema: no hay un destello claro antes de que cargue el JavaScript.
    const html = await (await page.request.get('/cuenta')).text();
    expect(html).toMatch(/<html[^>]*data-tema="oscuro"/);
    await page.reload();
    expect(await fondo(page)).toBe(OSCURO);
    await expect(page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: 'Oscuro' })).toBeChecked();
  });

  test('Claro gana aunque el sistema esté en oscuro; Sistema vuelve a seguirlo', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/cuenta');
    expect(await fondo(page)).toBe(OSCURO);
    const tema = page.getByRole('group', { name: 'Tema' });
    await tema.getByText('Claro').click();
    await expect.poll(() => fondo(page)).toBe(CLARO);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
    await page.reload();
    expect(await fondo(page)).toBe(CLARO);

    await page.getByRole('group', { name: 'Tema' }).getByText('Sistema').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-tema');
    await expect.poll(() => fondo(page)).toBe(OSCURO);
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute('content', '#0b141d');
  });

  test('un valor raro en la cookie se toma como Sistema', async ({ page, context }) => {
    await context.addCookies([{ name: 'turnoo_tema', value: '"><script>', url: 'http://localhost:3101' }]);
    await page.goto('/login');
    await expect(page.locator('html')).not.toHaveAttribute('data-tema');
    expect(await fondo(page)).toBe(CLARO);
  });

  test('Oscuro elegido y oscuro del sistema dan los mismos colores', async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await context.addCookies([{ name: 'turnoo_tema', value: 'oscuro', url: 'http://localhost:3101' }]);
    await page.goto('/login');
    const elegido = await colores(page);
    await context.clearCookies();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    const delSistema = await colores(page);
    expect(Object.keys(elegido).length).toBeGreaterThan(20);
    expect(delSistema).toEqual(elegido);
    expect(elegido['--color-fondo']).toBe('#0b141d');
  });

  test('en el celular, el dueño lo cambia desde Más', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/mas');
    await page.getByRole('region', { name: 'Apariencia' }).getByText('Oscuro').click();
    await expect.poll(() => fondo(page)).toBe(OSCURO);
    expect(await cookieTema(page)).toBe('oscuro');
  });

  test('el superadmin lo cambia con el botón de la barra', async ({ page }) => {
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    await page.getByRole('button', { name: 'Tema: Sistema. Cambiar a claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
    await page.getByRole('button', { name: 'Tema: Claro. Cambiar a oscuro' }).click();
    await expect.poll(() => fondo(page)).toBe(OSCURO);
    await page.getByRole('button', { name: 'Tema: Oscuro. Cambiar a sistema' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-tema');
  });
});

test('en el escritorio, el menú lateral cambia el tema', async ({ page }, info) => {
  test.skip(esCelular(info.project.name), 'Menú lateral: en el escritorio');
  await entrarYEsperar(page, datos().empleado);
  const menu = page.getByRole('navigation', { name: 'Principal' });
  await menu.getByRole('group', { name: 'Tema' }).getByTitle('Oscuro').click();
  await expect.poll(() => fondo(page)).toBe(OSCURO);
  await expect(menu.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
  await page.goto('/agenda');
  expect(await fondo(page)).toBe(OSCURO);
});

test.describe('título de la pestaña', () => {
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Igual en todos los tamaños'));

  test('el dueño ve cuántos clientes esperan respuesta, también al navegar', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await expect(page).toHaveTitle(/^\((\d|9\+)\) Hoy · Turnoo$/);
    await page.goto('/clientes');
    await expect(page).toHaveTitle(/^\((\d|9\+)\) Clientes · Turnoo$/);
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: /^Mensajes/ }).click();
    await expect(page).toHaveTitle(/^\((\d|9\+)\) Mensajes · Turnoo$/);
  });

  test('el barbero no tiene contador en el título', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await expect(page).toHaveTitle('Hoy · Turnoo');
  });
});

test.describe('contraseña en Cuenta', () => {
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Igual en todos los tamaños'));

  test('está colapsada; "Cambiar" abre el formulario y "Cancelar" lo cierra', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/cuenta');
    const seccion = page.getByRole('region', { name: 'Contraseña' });
    await expect(seccion.getByLabel('Contraseña actual')).toHaveCount(0);
    const cambiar = seccion.getByRole('button', { name: 'Cambiar contraseña' });
    await expect(cambiar).toHaveAttribute('aria-expanded', 'false');
    await cambiar.click();
    await expect(seccion.getByLabel('Contraseña actual', { exact: true })).toBeFocused();
    await seccion.getByRole('button', { name: 'Cancelar' }).click();
    await expect(seccion.getByLabel('Contraseña actual', { exact: true })).toHaveCount(0);
    await expect(seccion.getByRole('button', { name: 'Cambiar contraseña' })).toBeFocused();
  });
});
