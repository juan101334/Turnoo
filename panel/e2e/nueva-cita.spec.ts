import { expect, test } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * Nueva cita con el cliente primero (buscarlo o "Cliente nuevo"), desde la ficha del cliente y
 * desde un hueco de la agenda. El teléfono de un cliente existente nunca va en la URL.
 */

const UUID = '[0-9a-f-]{36}';

test.describe('nueva cita: el cliente primero', () => {
  test('se busca un cliente por nombre, se elige y la cita queda a su nombre', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/citas/nueva');
    // Hasta elegir el cliente no se ofrece lo demás.
    await expect(page.getByRole('checkbox', { name: /Corte/ })).toHaveCount(0);

    await page.getByLabel('Buscar cliente por nombre o teléfono').fill('Cliente Futuro');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('list', { name: 'Clientes encontrados' }).getByRole('link', { name: /Cliente Futuro/ }).click();
    await expect(page).toHaveURL(new RegExp(`/citas/nueva\\?cliente=${UUID}`));
    expect(page.url()).not.toMatch(/telefono|57\d{8}/);

    await page.getByRole('checkbox', { name: /Corte/ }).check();
    await page.getByRole('button', { name: 'Ver horas libres' }).click();
    // Esperar a que el día elegido quede en la URL: si no, se marcaría una hora del día anterior.
    const dia6 = page.getByRole('navigation', { name: 'Días' }).getByRole('link').nth(6);
    const destino6 = (await dia6.getAttribute('href'))!;
    await dia6.click();
    await expect(page).toHaveURL(destino6);
    // No pide teléfono: lo pone el servidor.
    await expect(page.getByLabel('Teléfono del cliente')).toHaveCount(0);
    await page.locator('label').filter({ has: page.getByRole('radio') }).first().click();
    await page.getByRole('button', { name: 'Agendar cita' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Cita agendada.' })).toBeVisible();
    await expect(page.locator('section').getByText('Cliente Futuro')).toBeVisible();
  });

  test('una búsqueda sin resultados lo dice y deja agendar como cliente nuevo', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/citas/nueva');
    await page.getByLabel('Buscar cliente por nombre o teléfono').fill('Nadie Con Este Nombre');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Ningún cliente coincide con "Nadie Con Este Nombre".')).toBeVisible();
    await page.getByRole('link', { name: 'Cliente nuevo' }).click();
    await expect(page.getByText('Escribe su teléfono al final.')).toBeVisible();
    await page.getByRole('link', { name: 'Cambiar' }).click();
    await expect(page.getByLabel('Buscar cliente por nombre o teléfono')).toBeVisible();
  });

  test('desde la ficha del cliente: "Agendar una cita" llega con el cliente elegido, solo con su id', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/clientes?buscar=Cliente Pasado');
    await page.getByRole('link', { name: /Cliente Pasado/ }).click();
    await page.getByRole('link', { name: 'Agendar una cita' }).click();
    await expect(page).toHaveURL(new RegExp(`/citas/nueva\\?cliente=${UUID}$`));
    await expect(page.getByRole('region', { name: 'Cliente' })).toContainText('Cliente Pasado');
    await expect(page.getByRole('checkbox', { name: /Corte/ })).toBeVisible();
  });

  test('un cliente que no existe se vuelve a buscar, sin pantalla de error', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/citas/nueva?cliente=00000000-0000-4000-8000-000000000000');
    await expect(page.getByText('Ese cliente ya no está disponible')).toBeVisible();
    await expect(page.getByLabel('Buscar cliente por nombre o teléfono')).toBeVisible();
  });

  test('desde un hueco de la agenda, la hora queda marcada y el resumen fijo la muestra', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    await page.getByRole('link', { name: /^Agendar, libre de 9:30/ }).click();
    await page.getByRole('link', { name: 'Cliente nuevo' }).click();
    await page.getByRole('checkbox', { name: /Corte/ }).check();
    await page.getByRole('button', { name: 'Ver horas libres' }).click();

    await expect(page.getByRole('radio', { name: /^9:30/ })).toBeChecked();
    const resumen = page.getByText(/· Cliente nuevo · Corte · 30 min · \$25\.000/);
    await expect(resumen).toBeVisible();
    await expect(resumen.locator('..')).toContainText(/^9:30/);

    // Al elegir otra, el resumen cambia.
    await page.locator('label').filter({ hasText: /^10:00 / }).click();
    await expect(resumen.locator('..')).toContainText(/^10:00/);
  });
});
