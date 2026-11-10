import { expect, test } from '@playwright/test';
import { alerta, datos, entrar, entrarYEsperar } from './datos';

/**
 * La cuenta propia y los primeros pasos del dueño. El cambio de contraseña usa una dueña solo
 * para esto (sembrar.ts): así las demás pruebas siguen entrando con la clave de siempre.
 */

test('cambiar la contraseña: pide la actual, cierra las otras sesiones y esta sigue abierta', async ({ page, browser }) => {
  const nueva = 'clave-nueva-cuenta-123';
  // Otra sesión de la misma persona (otro celular).
  const otro = await browser.newPage();
  await entrarYEsperar(otro, datos().cuenta);

  await entrarYEsperar(page, datos().cuenta);
  await page.goto('/cuenta');
  const seccion = page.getByRole('region', { name: 'Contraseña' });
  await seccion.getByRole('button', { name: 'Cambiar contraseña' }).click();

  // "Mostrar" deja ver lo que se escribe.
  const actual = seccion.getByLabel('Contraseña actual', { exact: true });
  await actual.fill('no-es-esta-clave');
  await expect(actual).toHaveAttribute('type', 'password');
  await seccion.getByRole('button', { name: 'Mostrar' }).first().click();
  await expect(actual).toHaveAttribute('type', 'text');

  await seccion.getByLabel('Contraseña nueva', { exact: true }).fill(nueva);
  await seccion.getByLabel('Repite la contraseña nueva').fill(nueva);
  await seccion.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(alerta(page)).toContainText('La contraseña actual no es correcta');
  await expect(seccion.getByLabel('Contraseña nueva', { exact: true })).toHaveValue(nueva);

  await actual.fill(datos().clave);
  await seccion.getByLabel('Repite la contraseña nueva').fill('otra-distinta-123');
  await seccion.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(alerta(page)).toContainText('Las dos contraseñas nuevas no coinciden.');

  await seccion.getByLabel('Repite la contraseña nueva').fill(nueva);
  const historial = () => page.evaluate(() => window.history.length);
  const antes = await historial();
  await seccion.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Contraseña cambiada.' })).toBeVisible();
  // Guardar no deja entradas de más en el historial (el aviso al salir no pone ni quita nada).
  expect(await historial()).toBe(antes);
  // Cambiada, el formulario se cierra y vuelve la fila con "Cambiar".
  await expect(actual).toHaveCount(0);
  await expect(seccion.getByRole('button', { name: 'Cambiar contraseña' })).toBeFocused();

  // Esta sesión sigue; la del otro celular se cerró.
  await page.goto('/hoy');
  await expect(page).toHaveURL('/hoy');
  await otro.goto('/hoy');
  await expect(otro).not.toHaveURL('/hoy');
  await otro.close();

  // Con la nueva se entra; con la vieja, no.
  await page.context().clearCookies();
  await entrar(page, datos().cuenta, datos().clave);
  await expect(alerta(page)).toContainText('El correo o la contraseña no son correctos.');
  await page.getByLabel('Contraseña').fill(nueva);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/hoy');
});

test('el login deja ver la contraseña con "Mostrar"', async ({ page }) => {
  await page.goto('/login');
  const clave = page.getByLabel('Contraseña');
  await clave.fill('secreta-123');
  await expect(clave).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar' }).click();
  await expect(clave).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-pressed', 'true');
});

test('el dueño ve en Hoy los primeros pasos que le faltan', async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
  const pasos = page.getByRole('region', { name: 'Primeros pasos' });
  await expect(pasos).toContainText(/\d de 5 listos/);
  // En el celular solo se ve lo que falta: los barberos ya están.
  await expect(pasos.getByRole('link', { name: /Agrega a tus barberos/ })).toBeHidden();
  // La base de conocimiento empieza vacía (las pruebas de mensajes la llenan después).
  const base = pasos.getByRole('link', { name: /Enséñale al asistente/ });
  await expect(base).toHaveAttribute('href', '/conocimiento');
  await expect(base).not.toContainText('Listo');
});

test('el barbero no ve los primeros pasos', async ({ page }) => {
  await entrarYEsperar(page, datos().empleado);
  await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0);
});
