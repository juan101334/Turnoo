import { expect, test, type Page } from '@playwright/test';
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
  await page.goto('/clientes?buscar=Cliente Tabla');
  const tabla = page.getByRole('table');
  await expect(tabla.getByRole('columnheader', { name: 'Teléfono' })).toBeVisible();
  await expect(tabla.getByRole('columnheader', { name: 'Cliente desde' })).toHaveCount(0);
  const fila = tabla.getByRole('row').filter({ hasText: 'Cliente Tabla' });
  await expect(fila).toContainText(/\+57 \d{3} \d{3} \d{4}/);
  // En 20 días a las 4:00 p. m. (sembrar.ts): fecha corta y hora; sin visitas todavía; una cita.
  const celdas = fila.getByRole('cell');
  await expect(celdas.nth(3)).toHaveText(/^\d{1,2} \p{L}{3} \d{4} · 4:00\sp\.\sm\.$/u);
  await expect(celdas.nth(2)).toHaveText(/Ninguna/);
  await expect(celdas.nth(4)).toHaveText('1');
  await fila.getByRole('link', { name: 'Agendar' }).click();
  await expect(page).toHaveURL(/\/citas\/nueva\?cliente=[0-9a-f-]{36}$/);
});

/** Lo que dice una columna de la tabla, fila por fila. */
const columna = (page: Page, n: number) =>
  page.getByRole('table').locator('tbody tr').evaluateAll((filas, i) => filas.map((f) => (f as HTMLTableRowElement).cells[i]?.textContent ?? ''), n);

test('clientes: se ordena por columna; tocar la misma invierte y la búsqueda conserva el orden', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  await page.goto('/clientes');
  const tabla = page.getByRole('table');
  const encabezado = (nombre: string) => tabla.getByRole('columnheader', { name: nombre });
  await expect(encabezado('Nombre')).toHaveAttribute('aria-sort', 'ascending');
  await expect(encabezado('Teléfono')).not.toHaveAttribute('aria-sort', /./);

  await encabezado('Nº de citas').getByRole('link').click();
  await expect(page).toHaveURL(/orden=total_citas&direccion=desc/);
  await expect(encabezado('Nº de citas')).toHaveAttribute('aria-sort', 'descending');
  await expect(encabezado('Nombre')).toHaveAttribute('aria-sort', 'none');
  const bajando = (await columna(page, 4)).map(Number);
  expect(bajando.length).toBeGreaterThan(2);
  expect(bajando).toEqual([...bajando].sort((a, b) => b - a));
  expect(bajando[0]).toBeGreaterThan(bajando.at(-1)!);

  await encabezado('Nº de citas').getByRole('link').click();
  await expect(page).toHaveURL(/orden=total_citas&direccion=asc/);
  await expect(encabezado('Nº de citas')).toHaveAttribute('aria-sort', 'ascending');
  const subiendo = (await columna(page, 4)).map(Number);
  expect(subiendo).toEqual([...subiendo].sort((a, b) => a - b));

  // Próxima cita: la más cercana primero y los que no tienen, al final.
  await encabezado('Próxima cita').getByRole('link').click();
  await expect(page).toHaveURL(/orden=proxima_cita&direccion=asc/);
  const proximas = await columna(page, 3);
  const primeraVacia = proximas.findIndex((t) => t.includes('Ninguna'));
  expect(primeraVacia).toBeGreaterThan(0);
  expect(proximas.slice(primeraVacia).every((t) => t.includes('Ninguna'))).toBe(true);

  await page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' }).fill('Cliente');
  await expect(page).toHaveURL(/buscar=Cliente/);
  await expect(page).toHaveURL(/orden=proxima_cita&direccion=asc/);
  await expect(encabezado('Próxima cita')).toHaveAttribute('aria-sort', 'ascending');
});

test('clientes: sin nombre, el teléfono hace de nombre en la tabla', async ({ page }) => {
  const telefono = datos().clientes.telefonoSinNombre;
  await entrarYEsperar(page, datos().dueno);
  await page.goto(`/clientes?buscar=${telefono.slice(-7)}`);
  const fila = page.getByRole('table').locator('tbody tr').first();
  await expect(fila.getByRole('cell').first()).toHaveText(/^\+57 \d{3} \d{3} \d{4}Sin nombre$/);
  await expect(fila.getByRole('link').first()).toHaveText(`+57 ${telefono.slice(2, 5)} ${telefono.slice(5, 8)} ${telefono.slice(8)}`);
});
