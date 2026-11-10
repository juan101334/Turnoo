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

test('anchos estándar: cada página con su ancho, centrada en el espacio junto al menú', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  /** Ancho del contenedor de la página y cuánto se aparta su centro del centro del área de contenido. */
  const medir = async (ruta: string) => {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    return page.evaluate(() => {
      const main = document.getElementById('contenido')!;
      const estilo = getComputedStyle(main);
      const caja = main.getBoundingClientRect();
      const izquierda = caja.left + parseFloat(estilo.paddingLeft);
      const derecha = caja.right - parseFloat(estilo.paddingRight);
      const pagina = main.querySelector(':scope > div > :last-child')!.getBoundingClientRect();
      return { ancho: Math.round(pagina.width), desvio: Math.round(Math.abs((pagina.left + pagina.right) / 2 - (izquierda + derecha) / 2)) };
    });
  };
  for (const ancho of [1440, 1920]) {
    await page.setViewportSize({ width: ancho, height: 1000 });
    const formularios = { '/cuenta': await medir('/cuenta') };
    const listas = {
      '/usuarios': await medir('/usuarios'),
      '/negocio': await medir('/negocio'),
      '/clientes': await medir('/clientes'),
      '/por-aprobar': await medir('/por-aprobar'),
      '/plan': await medir('/plan'),
    };
    for (const [ruta, m] of Object.entries(formularios)) expect(m, `${ruta} a ${ancho}`).toEqual({ ancho: 672, desvio: 0 });
    for (const [ruta, m] of Object.entries(listas)) expect(m, `${ruta} a ${ancho}`).toEqual({ ancho: 1024, desvio: 0 });
    // Hoy ocupa todo el ancho hasta el tope del marco (1440 px), también centrado.
    expect(await medir('/hoy'), `/hoy a ${ancho}`).toEqual({ ancho: Math.min(1440, ancho - 240 - 80), desvio: 0 });
  }
});
