import { expect, test } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

test.describe('clientes', () => {
  test('el barbero ve solo sus clientes, los busca y abre su ficha', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Clientes' }).click();
    await expect(page.getByRole('heading', { name: 'Mis clientes' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cliente Pasado/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cliente De Otro/ })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' }).fill('Futuro');
    await expect(page).toHaveURL(/buscar=Futuro/);
    await expect(page.getByRole('link', { name: /Cliente Futuro/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cliente Pasado/ })).toHaveCount(0);

    await page.getByRole('link', { name: /Cliente Futuro/ }).click();
    await expect(page.getByRole('heading', { name: 'Cliente Futuro' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/57\d{10}$/);

    // Su historial: cada cita abre su detalle.
    const historial = page.getByRole('region', { name: 'Historial de citas' });
    await expect(historial.getByRole('link').first()).toHaveAttribute('href', /^\/citas\/[0-9a-f-]{36}$/);
    await expect(historial).toContainText('Corte');
  });

  test('una búsqueda sin resultados lo dice', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/clientes?buscar=nadie-se-llama-asi');
    await expect(page.getByText('Ningún cliente coincide con "nadie-se-llama-asi".')).toBeVisible();
  });

  test('el dueño ve los clientes de todos los barberos', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes?buscar=Cliente De Otro');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cliente De Otro/ })).toBeVisible();
  });

  test('sin nombre, el teléfono hace de nombre; con cita, la próxima a la vista', async ({ page }) => {
    const telefono = datos().clientes.telefonoSinNombre;
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/clientes?buscar=${telefono.slice(-7)}`);
    const legible = `+57 ${telefono.slice(2, 5)} ${telefono.slice(5, 8)} ${telefono.slice(8)}`;
    await expect(page.getByRole('link', { name: `${legible} Sin nombre` })).toBeVisible();

    await page.goto('/clientes?buscar=Cliente Tabla');
    await expect(page.getByRole('link', { name: /Cliente Tabla/ })).toContainText(/Próxima cita: \d{1,2} \p{L}{3} \d{4} · 4:00/u);
  });
});
