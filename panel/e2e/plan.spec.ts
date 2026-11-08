import { expect, test } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/** El negocio de e2e tiene el plan "Prueba E2E": 50 conversaciones (lleva 42) y 100 citas al mes (ver sembrar.ts). */
test.describe('plan', () => {
  test('el dueño ve el uso del mes frente al plan, con aviso desde el 80%', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan Prueba E2E' })).toBeVisible();
    await expect(page.getByText(/Los contadores vuelven a cero el 1 de /)).toBeVisible();
    await expect(page.getByText('Periodo de prueba.')).toBeVisible();

    const conversaciones = page.getByRole('region', { name: 'Conversaciones con el asistente' });
    await expect(conversaciones).toContainText('42 de 50');
    await expect(conversaciones.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '84');
    await expect(conversaciones).toContainText('Vas en el 84% del mes.');

    const citas = page.getByRole('region', { name: 'Citas creadas' });
    await expect(citas).toContainText(/\d+ de 100/);
    await expect(citas).not.toContainText('Vas en el');

    await expect(page.getByRole('region', { name: 'Mensajes automáticos' })).toContainText('3 · sin límite');
  });

  test('el barbero no ve el plan', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  });
});
