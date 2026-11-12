import { expect, test } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * El negocio de e2e tiene el plan "Prueba E2E": 50 conversaciones (lleva 42) y 100 citas al mes,
 * y está en prueba por 20 días más (ver sembrar.ts). El panel de e2e tiene SOPORTE_WHATSAPP.
 */
test.describe('plan', () => {
  test('el dueño ve el uso del mes frente al plan, con aviso desde el 80%', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan Prueba E2E' })).toBeVisible();
    await expect(page.getByText(/Los contadores vuelven a cero el 1 de /)).toBeVisible();
    await expect(page.getByText(/^Periodo de prueba hasta el \p{L}+ \d{1,2} de \p{L}+\.$/u)).toBeVisible();

    const conversaciones = page.getByRole('region', { name: 'Conversaciones con el asistente' });
    await expect(conversaciones).toContainText('42 de 50');
    await expect(conversaciones.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '84');
    await expect(conversaciones).toContainText('Vas en el 84% del mes.');

    const citas = page.getByRole('region', { name: 'Citas creadas' });
    await expect(citas).toContainText(/\d+ de 100/);
    await expect(citas).not.toContainText('Vas en el');

    await expect(page.getByRole('region', { name: 'Mensajes automáticos' })).toContainText('3 · sin límite');

    // "soporte de Turnoo" abre el chat de WhatsApp del soporte en otra pestaña.
    const soporte = page.getByRole('link', { name: 'soporte de Turnoo' });
    await expect(soporte).toHaveAttribute('href', 'https://wa.me/573000000000');
    await expect(soporte).toHaveAttribute('target', '_blank');
    await expect(soporte).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('el barbero no ve el plan', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  });
});
