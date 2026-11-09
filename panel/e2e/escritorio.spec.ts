import { expect, test } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/** Lo que cambia en el escritorio: mensajes en dos paneles y clientes en tabla. */

test.beforeEach(({}, info) => test.skip(info.project.name !== 'escritorio', 'Solo en el escritorio'));

test('mensajes: la lista queda a la izquierda y la conversación se abre al lado, con la respuesta a la vista', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  await page.goto('/mensajes?ver=todas');
  await expect(page.getByText('Elige una conversación para leerla y responder.')).toBeVisible();

  const lista = page.getByRole('list', { name: 'Conversaciones' });
  await lista.getByRole('link', { name: /Cliente Derivado/ }).click();
  await expect(page).toHaveURL(`/mensajes/${datos().conversaciones.derivada}?ver=todas`);
  // La lista sigue ahí, con la abierta marcada y el mismo filtro.
  await expect(lista.getByRole('link', { name: /Cliente Derivado/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Todas' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Cliente Derivado' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Responder' })).toBeInViewport();

  await lista.getByRole('link', { name: /Cliente Con Asistente/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cliente Con Asistente' })).toBeVisible();
});

test('clientes: tabla con teléfono y fecha, y "Agendar" que lleva el cliente a Nueva cita', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  await page.goto('/clientes?buscar=Cliente Futuro');
  const tabla = page.getByRole('table');
  await expect(tabla.getByRole('columnheader', { name: 'Teléfono' })).toBeVisible();
  const fila = tabla.getByRole('row').filter({ hasText: 'Cliente Futuro' });
  await expect(fila).toContainText(/\+57 \d{3} \d{3} \d{4}/);
  await fila.getByRole('link', { name: 'Agendar' }).click();
  await expect(page).toHaveURL(/\/citas\/nueva\?cliente=[0-9a-f-]{36}$/);
});
