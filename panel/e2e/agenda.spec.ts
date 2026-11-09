import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * La agenda del día: en el celular, lista con "Sigue", huecos y "Completada" en la tarjeta (con
 * deshacer); en el escritorio, grilla por barbero con el detalle al lado. Ver sembrar.ts:
 * "Cliente Deshacer" y "Cliente Rápido" ya empezaron (Barbero E2E); `vista.fecha` tiene a las 9:00
 * una cita por barbero y el almuerzo del Barbero E2E de 13:00 a 14:00.
 */

const esCelular = (nombre: string) => nombre === 'celular';
const tarjeta = (page: Page, cliente: string) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(cliente) }) });

test.describe('agenda en el celular', () => {
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Lista del celular'));

  test('"Completada" en la tarjeta: Deshacer la deja como estaba y no se guarda', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    const cita = tarjeta(page, 'Cliente Deshacer');
    await cita.getByRole('button', { name: 'Completada, Cliente Deshacer' }).click();
    await expect(cita.getByText('Completada', { exact: true })).toBeVisible();
    await expect(cita.getByRole('button')).toHaveCount(0);

    const aviso = page.getByRole('status').filter({ hasText: 'Completada: Cliente Deshacer.' });
    await aviso.getByRole('button', { name: 'Deshacer' }).click();
    await expect(cita.getByRole('button', { name: 'Completada, Cliente Deshacer' })).toBeVisible();

    // Al recargar sigue sin marcar: nunca se mandó al backend.
    await page.reload();
    await expect(tarjeta(page, 'Cliente Deshacer').getByText('Pendiente', { exact: true })).toBeVisible();
  });

  test('"Completada" en la tarjeta se guarda cuando se acaba el tiempo para deshacer', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().empleado);
    await page.waitForLoadState('networkidle');
    await tarjeta(page, 'Cliente Rápido').getByRole('button', { name: 'Completada, Cliente Rápido' }).click();

    const guardado = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/hoy'));
    await page.clock.fastForward('00:08');
    expect((await guardado).ok()).toBe(true);

    await page.reload();
    const cita = tarjeta(page, 'Cliente Rápido');
    await expect(cita.getByText('Completada', { exact: true })).toBeVisible();
    await expect(cita.getByRole('button')).toHaveCount(0);
  });

  test('Hoy muestra arriba quién sigue, con el barbero para el dueño', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    const sigue = page.getByRole('region', { name: /^(Sigue|En curso)/ });
    await expect(sigue).toBeVisible();
    await expect(sigue).toContainText('Barbero Dos');
    await expect(sigue.getByRole('link', { name: 'Ver cita' })).toHaveAttribute('href', /^\/citas\/[0-9a-f-]{36}$/);
  });

  test('el día muestra fin, duración y precio, los bloqueos y los huecos para agendar', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${fecha}`);

    await expect(tarjeta(page, 'Cliente Vista Uno')).toContainText(/hasta 9:30.*· 30 min · \$25\.000/);
    await expect(tarjeta(page, 'Cliente Vista Uno')).toContainText('Confirmada');
    await expect(page.getByRole('listitem').filter({ hasText: 'Almuerzo' })).toContainText(/1:00.*– 2:00/);

    const hueco = page.getByRole('link', { name: /^Agendar, libre de 8:00/ });
    await expect(hueco).toHaveAttribute('href', new RegExp(`^/citas/nueva\\?fecha=${fecha}&barbero=[0-9a-f-]{36}$`));
    // De 9:30 a 13:00 libre; el almuerzo parte la tarde.
    await expect(page.getByRole('link', { name: /^Agendar, libre de 9:30.*– 1:00/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Agendar, libre de 2:00/ })).toBeVisible();
  });

  test('el calendario junto a la tira cambia de día al elegir, sin otro botón', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/agenda');
    // El calendario cambia de día con JavaScript: que la página ya esté interactiva.
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Ir a otra fecha').fill(fecha);
    await expect(page).toHaveURL(`/agenda?fecha=${fecha}`);
    await expect(tarjeta(page, 'Cliente Vista Uno')).toBeVisible();
  });
});

test.describe('agenda en el escritorio', () => {
  test.beforeEach(({}, info) => test.skip(esCelular(info.project.name), 'Grilla del escritorio'));

  test('una columna por barbero, con citas y bloqueos en su hora', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    const uno = page.getByRole('group', { name: 'Agenda de Barbero E2E' });
    const dos = page.getByRole('group', { name: 'Agenda de Barbero Dos' });
    await expect(uno.getByRole('link', { name: /Cliente Vista Uno, Corte, Confirmada/ })).toBeVisible();
    await expect(dos.getByRole('link', { name: /Cliente Vista Dos, Corte, Pendiente/ })).toBeVisible();
    await expect(uno.getByText('Almuerzo')).toBeVisible();
    await expect(dos.getByText('Almuerzo')).toHaveCount(0);
    // Las dos citas de las 9:00 quedan a la misma altura.
    const [a, b] = await Promise.all([
      uno.getByRole('link', { name: /Cliente Vista Uno/ }).boundingBox(),
      dos.getByRole('link', { name: /Cliente Vista Dos/ }).boundingBox(),
    ]);
    expect(a!.y).toBe(b!.y);
  });

  test('la cita se abre al lado sin salir de la agenda, y Escape la cierra', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${fecha}`);
    await page.getByRole('link', { name: /Cliente Vista Uno/ }).click();

    await expect(page).toHaveURL(new RegExp(`/agenda\\?fecha=${fecha}&cita=[0-9a-f-]{36}$`));
    await expect(page).toHaveTitle(/Cliente Vista Uno · Turnoo/);
    const panel = page.getByRole('complementary', { name: /9:00/ });
    await expect(panel).toContainText('Barbero E2E');
    await expect(panel.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(page.getByRole('group', { name: 'Agenda de Barbero Dos' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`/agenda?fecha=${fecha}`);
    await expect(panel).toHaveCount(0);
  });

  test('una cita que no es del barbero no rompe la agenda: el panel lo dice', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}&cita=${datos().agenda.citaAjena}`);
    await expect(page.getByText('Esta cita no existe o no es de tu agenda.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Agenda de Barbero E2E' })).toBeVisible();
  });

  test('las flechas pasan al día anterior y al siguiente', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${fecha}`);
    await page.getByRole('link', { name: 'Día siguiente' }).click();
    await expect(page).not.toHaveURL(`/agenda?fecha=${fecha}`);
    await page.getByRole('link', { name: 'Día anterior' }).click();
    await expect(page).toHaveURL(`/agenda?fecha=${fecha}`);
  });
});
