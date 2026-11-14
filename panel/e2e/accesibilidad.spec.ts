import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * Revisión automática de accesibilidad (axe-core, reglas WCAG 2.1 A y AA) en las pantallas
 * principales, en modo claro y oscuro. No reemplaza probar con teclado y lector de pantalla,
 * pero frena lo que se puede medir: contraste, nombres de botones y campos, roles, orden de títulos.
 */

async function revisar(page: Page, pantalla: string) {
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // El indicador de Next.js en desarrollo no es parte del panel.
    .exclude('nextjs-portal')
    .analyze();
  const resumen = violations.map((v) => `${pantalla}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(resumen, resumen.join('\n')).toEqual([]);
}

for (const modo of ['light', 'dark'] as const) {
  test.describe(`accesibilidad en modo ${modo === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: modo });

    test('acceso y pantallas del dueño', async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto('/login');
      await revisar(page, 'login');
      await entrarYEsperar(page, datos().dueno);
      const rutas = [
        '/hoy',
        `/agenda?fecha=${datos().vista.fecha}`,
        `/citas/nueva?cliente=nuevo&fecha=${datos().vista.fecha}`,
        '/por-aprobar',
        '/mensajes?ver=todas',
        `/mensajes/${datos().conversaciones.derivada}`,
        '/clientes',
        `/clientes/${datos().clientes.editable}`,
        '/bloqueos',
        '/equipo',
        '/usuarios',
        '/negocio',
        '/conocimiento',
        '/plan',
        '/cuenta',
        '/mas',
      ];
      for (const ruta of rutas) {
        await page.goto(ruta);
        await revisar(page, ruta);
      }
    });

    test('ficha de un barbero, con los formularios para agregar abiertos', async ({ page }) => {
      await entrarYEsperar(page, datos().dueno);
      await page.goto('/equipo');
      await page.getByRole('button', { name: 'Nuevo barbero' }).click();
      await revisar(page, '/equipo con "Nuevo barbero" abierto');
      await page.getByRole('link', { name: /^Barbero Dos/ }).click();
      await page.getByRole('button', { name: 'Nuevo servicio' }).click();
      await revisar(page, 'servicios del barbero');
      await page.getByRole('navigation', { name: 'Secciones del barbero' }).getByRole('link', { name: 'Horario' }).click();
      await page.getByRole('button', { name: 'Nuevo horario' }).click();
      await revisar(page, 'horario del barbero');
    });

    test('la semana del barbero', async ({ page }, info) => {
      test.skip(info.project.name === 'celular', 'La semana es solo del PC');
      await entrarYEsperar(page, datos().empleado);
      const ruta = `/agenda?fecha=${datos().vista.fecha}&vista=semana`;
      await page.goto(ruta);
      await revisar(page, ruta);
    });

    test('pantallas del superadmin', async ({ page }) => {
      await entrarYEsperar(page, datos().superadmin, '/superadmin');
      await revisar(page, '/superadmin');
      await page.getByRole('list', { name: 'Negocios' }).getByRole('link', { name: /Barbería E2E/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Barbería E2E' })).toBeVisible();
      await revisar(page, 'ficha del negocio');
    });
  });
}

test('con el teclado, lo primero es "Saltar al contenido" y lleva al contenido', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  // Carga completa, como cuando se abre el panel: el foco empieza en el documento.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  const saltar = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(saltar).toBeFocused();
  await expect(saltar).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();
});

test.describe('modo oscuro según el sistema', () => {
  test.use({ colorScheme: 'dark' });

  test('el fondo, el texto y la barra del navegador cambian con el sistema', async ({ page }) => {
    await page.goto('/login');
    const colores = await page.evaluate(() => {
      const estilo = getComputedStyle(document.body);
      return { fondo: estilo.backgroundColor, texto: estilo.color, esquema: getComputedStyle(document.documentElement).colorScheme };
    });
    expect(colores).toEqual({ fondo: 'rgb(11, 20, 29)', texto: 'rgb(228, 235, 241)', esquema: 'light dark' });
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute('content', '#0b141d');
  });
});

test('instalable: manifiesto e ícono de Apple, sin service worker', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Turnoo');
  // A propósito no hay service worker: el barbero nunca debe ver una agenda vieja guardada.
  expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)).toBe(0);
});
