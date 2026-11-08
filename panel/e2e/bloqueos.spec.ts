import { expect, test } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/** "Cliente Futuro" tiene cita con el Barbero E2E pasado mañana a las 10:00 (ver sembrar.ts). */

const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

test.describe.serial('bloqueos', () => {
  test('el barbero bloquea unas horas: ve las citas que se cruzan y luego lo quita', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Bloqueos' }).click();
    await expect(page.getByRole('heading', { name: 'Mis bloqueos' })).toBeVisible();
    await page.getByRole('link', { name: 'Bloquear horas' }).click();

    // El barbero no elige a quién: es su agenda.
    await expect(page.getByLabel('¿A quién?')).toHaveCount(0);
    await page.getByLabel('Día', { exact: true }).fill(datos().agenda.fecha);
    await page.getByLabel('Desde', { exact: true }).fill('09:45');
    await page.getByLabel('Hasta', { exact: true }).fill('10:15');
    await page.getByLabel('Motivo (opcional)').fill('Permiso');
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();

    await expect(page.getByText('Bloqueo guardado.', { exact: false })).toBeVisible();
    await expect(page.getByText('Ya había 1 cita a esa hora')).toBeVisible();
    await expect(page.getByRole('link', { name: /Cliente Futuro/ })).toBeVisible();

    await page.getByRole('link', { name: 'Ver bloqueos' }).click();
    const item = page.getByRole('listitem').filter({ hasText: 'Permiso' });
    await expect(item).toContainText('1 cita se cruza');
    await expect(item).toContainText('Cliente Futuro');

    await item.getByRole('button', { name: 'Quitar' }).click();
    await item.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Permiso' })).toHaveCount(0);
  });

  test('un rango al revés se avisa antes de llegar al backend', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/bloqueos/nuevo');
    await page.getByLabel('Desde', { exact: true }).fill('14:00');
    await page.getByLabel('Hasta', { exact: true }).fill('13:00');
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText('El bloqueo debe terminar después de empezar.');
  });

  test('el dueño cierra todo el negocio un día; el barbero lo ve pero no lo puede quitar', async ({ page }) => {
    const dia = sumarDias(datos().agenda.fecha, 6);
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/bloqueos/nuevo');
    await page.getByLabel('¿A quién?').selectOption('negocio');
    await page.getByLabel('Todo el día').check();
    await page.getByLabel('Desde el día').fill(dia);
    await page.getByLabel('Motivo (opcional)').fill('Festivo E2E');
    await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
    await expect(page.getByText('Bloqueo guardado.', { exact: false })).toBeVisible();

    await page.context().clearCookies();
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/bloqueos');
    const cierre = page.getByRole('listitem').filter({ hasText: 'Festivo E2E' });
    await expect(cierre).toContainText('Todo el negocio');
    await expect(cierre).toContainText('todo el día');
    await expect(cierre.getByRole('button', { name: 'Quitar' })).toHaveCount(0);

    await page.context().clearCookies();
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/bloqueos');
    const delDueno = page.getByRole('listitem').filter({ hasText: 'Festivo E2E' });
    await delDueno.getByRole('button', { name: 'Quitar' }).click();
    await delDueno.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Festivo E2E' })).toHaveCount(0);
  });
});
