import { expect, test, type Page } from '@playwright/test';
import { alerta, datos, entrarYEsperar } from './datos';

/**
 * Agenda y acciones sobre citas, contra el backend real. Cada corrida siembra de nuevo:
 * "Cliente Pasado" empezó hace 30 min (hoy); "Cliente Futuro" y "Cliente Reprogramar" son de
 * pasado mañana a las 10:00 y 11:00 con el Barbero E2E; "Cliente De Otro", del Barbero Dos.
 */

const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const tarjeta = (page: Page, cliente: string) => page.getByRole('link', { name: new RegExp(cliente) });

/** Toca el botón de una hora, como lo haría una persona (el radio va oculto dentro). */
const elegirHora = async (page: Page, hora: string) => {
  await page.locator('label').filter({ hasText: new RegExp(`^${hora} `) }).click();
  await expect(page.getByRole('radio', { name: new RegExp(`^${hora} `) })).toBeChecked();
};

test.describe.serial('agenda y acciones sobre citas', () => {
  test('el barbero ve en Hoy su cita, con la línea de "ahora"', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await expect(tarjeta(page, 'Cliente Pasado')).toBeVisible();
    await expect(page.getByText(/^Ahora ·/)).toBeVisible();
  });

  test('el barbero ve solo sus citas; el dueño ve las de todos, con el barbero', async ({ page }) => {
    const { fecha } = datos().agenda;
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${fecha}`);
    await expect(tarjeta(page, 'Cliente Futuro')).toBeVisible();
    await expect(tarjeta(page, 'Cliente Reprogramar')).toBeVisible();
    await expect(tarjeta(page, 'Cliente De Otro')).toHaveCount(0);

    await page.context().clearCookies();
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${fecha}`);
    await expect(tarjeta(page, 'Cliente De Otro')).toContainText('Barbero Dos');
    await expect(tarjeta(page, 'Cliente Futuro')).toContainText('Barbero E2E');
  });

  test('la tira de días cambia de día y queda en la URL', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/agenda');
    await page.getByRole('navigation', { name: 'Días' }).getByRole('link').nth(2).click();
    await expect(page).toHaveURL(`/agenda?fecha=${datos().agenda.fecha}`);
    await expect(tarjeta(page, 'Cliente Futuro')).toBeVisible();
  });

  test('el barbero no puede abrir la cita de otro barbero', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/citas/${datos().agenda.citaAjena}`);
    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  });

  test('marcar completada y corregir a "no asistió" con confirmación', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await tarjeta(page, 'Cliente Pasado').click();
    await page.getByRole('button', { name: 'Completada' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cita marcada como completada.' })).toBeVisible();
    await expect(page.locator('section').getByText('Completada', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'No asistió' }).click();
    await expect(page.getByText('¿Marcar que el cliente no asistió?')).toBeVisible();
    await page.getByRole('button', { name: 'Sí, no asistió' }).click();
    await expect(page.locator('section').getByText('No asistió', { exact: true })).toBeVisible();
  });

  test('cancelar pide confirmación; "Volver" no cancela', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${datos().agenda.fecha}`);
    await tarjeta(page, 'Cliente Futuro').click();

    await page.getByRole('button', { name: 'Cancelar cita' }).click();
    await expect(page.getByText('El cliente no recibe un aviso automático', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.locator('section').getByText('Pendiente', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Cancelar cita' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();
    await expect(page.locator('section').getByText('Cancelada', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0);
  });

  test('reprogramar a otro día con una hora libre', async ({ page }) => {
    const nuevoDia = sumarDias(datos().agenda.fecha, 1);
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${datos().agenda.fecha}`);
    await tarjeta(page, 'Cliente Reprogramar').click();
    await expect(page).toHaveURL(/\/citas\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: 'Reprogramar', exact: true }).click();
    await expect(page).toHaveURL(/\/reprogramar$/);
    await page.getByRole('navigation', { name: 'Días' }).getByRole('link').nth(3).click();
    await expect(page).toHaveURL(new RegExp(`fecha=${nuevoDia}`));

    await elegirHora(page, '9:00');
    await page.getByRole('button', { name: 'Guardar la nueva hora' }).click();
    await expect(page.getByText('Cita reprogramada.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^9:00/);

    await page.goto(`/agenda?fecha=${nuevoDia}`);
    await expect(tarjeta(page, 'Cliente Reprogramar')).toBeVisible();
  });

  test('nueva cita: servicio, día, hora y cliente; las reglas las pone el backend', async ({ page }) => {
    const dia = sumarDias(datos().agenda.fecha, 2);
    await entrarYEsperar(page, datos().empleado);
    await page.getByRole('link', { name: 'Nueva cita' }).click();
    await page.getByRole('checkbox', { name: /Corte/ }).check();
    await page.getByRole('checkbox', { name: /Barba/ }).check();
    await page.getByRole('button', { name: 'Ver horas libres' }).click();
    await expect(page.getByText('50 min · $40.000')).toBeVisible();

    await page.getByRole('navigation', { name: 'Días' }).getByRole('link').nth(4).click();
    await expect(page).toHaveURL(new RegExp(`fecha=${dia}`));

    // Sin teléfono no se agenda: el navegador frena el envío (y el servidor lo revisa igual).
    await elegirHora(page, '10:00');
    await page.getByRole('button', { name: 'Agendar cita' }).click();
    const telefono = page.getByLabel('Teléfono del cliente');
    expect(await telefono.evaluate((campo: HTMLInputElement) => campo.validity.valueMissing)).toBe(true);
    await expect(page).toHaveURL(/\/citas\/nueva\?/);

    await page.getByLabel('Teléfono del cliente').fill('300 555 0101');
    await page.getByLabel('Nombre del cliente (opcional)').fill('Cliente Nuevo E2E');
    await page.getByRole('button', { name: 'Agendar cita' }).click();

    await expect(page.getByText('Cita agendada.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^10:00/);
    await expect(page.getByText('Cliente Nuevo E2E')).toBeVisible();
    await expect(page.getByText('$40.000')).toBeVisible();
    await expect(page.getByText('+57 300 555 0101')).toBeVisible();
  });

  test('si otra persona toma la hora mientras tanto, se muestra el error del backend', async ({ browser }) => {
    const dia = sumarDias(datos().agenda.fecha, 3);
    const enlace = async () => {
      const contexto = await browser.newContext();
      const page = await contexto.newPage();
      await entrarYEsperar(page, datos().empleado);
      await page.goto('/citas/nueva');
      await page.getByRole('checkbox', { name: /Corte/ }).check();
      await page.getByRole('button', { name: 'Ver horas libres' }).click();
      await page.goto(`${page.url().replace(/fecha=[^&]+/, `fecha=${dia}`)}`);
      await elegirHora(page, '3:00');
      return { contexto, page };
    };
    const primera = await enlace();
    const segunda = await enlace();

    await primera.page.getByLabel('Teléfono del cliente').fill('300 555 0202');
    await primera.page.getByRole('button', { name: 'Agendar cita' }).click();
    await expect(primera.page.getByText('Cita agendada.')).toBeVisible();

    await segunda.page.getByLabel('Teléfono del cliente').fill('300 555 0303');
    await segunda.page.getByRole('button', { name: 'Agendar cita' }).click();
    await expect(alerta(segunda.page)).toContainText('ya no está disponible');
    await expect(segunda.page).toHaveURL(/\/citas\/nueva\?/);

    await primera.contexto.close();
    await segunda.contexto.close();
  });
});
