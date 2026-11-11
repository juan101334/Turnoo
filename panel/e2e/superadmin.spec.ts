import { expect, test, type Locator, type Page } from '@playwright/test';
import { alerta, datos, entrarYEsperar } from './datos';

/**
 * Panel básico del superadmin: negocios, su estado, su WhatsApp y sus usuarios, con las rutas que
 * ya tiene el backend. Corre en orden: el negocio se crea en la segunda prueba.
 */

const nombre = `Barbería Superadmin ${Date.now()}`;
const seccion = (page: Page, titulo: string) => page.getByRole('region', { name: titulo });
const digitos = () => String(Math.floor(1e11 + Math.random() * 9e11));

async function abrirAcciones(fila: Locator) {
  const menu = fila.locator('details');
  if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open))) await fila.getByText('Acciones', { exact: true }).click();
}

async function abrirNegocio(page: Page, negocio: string) {
  await entrarYEsperar(page, datos().superadmin, '/superadmin');
  await page.getByRole('list', { name: 'Negocios' }).getByRole('link', { name: new RegExp(negocio) }).click();
  await expect(page.getByRole('heading', { level: 1, name: negocio })).toBeVisible();
}

test.describe.serial('superadmin', () => {
  test('la lista muestra los negocios con su estado y se puede buscar', async ({ page }) => {
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    const lista = page.getByRole('list', { name: 'Negocios' });
    await expect(lista.getByRole('link', { name: /Barbería E2E/ })).toBeVisible();
    await page.getByLabel('Buscar negocio por nombre').fill('barberia e2e');
    await expect(page).toHaveURL(/buscar=barberia/);
    await expect(lista.getByRole('link')).toHaveCount(1);
  });

  test('crear un negocio lo deja en prueba y sin WhatsApp', async ({ page }) => {
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    await page.getByRole('link', { name: 'Nuevo negocio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo negocio' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await expect(page).toHaveURL(/\/superadmin\/negocios\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
    await expect(page.getByText('En prueba', { exact: true })).toBeVisible();
    await expect(seccion(page, 'WhatsApp')).toContainText('Sin número conectado');
  });

  test('conectar el WhatsApp: valida los ids y el token no se vuelve a mostrar', async ({ page }) => {
    const token = `token-de-prueba-superadmin-${Date.now()}`;
    await abrirNegocio(page, nombre);
    const whatsapp = seccion(page, 'WhatsApp');
    await whatsapp.getByLabel('Phone number ID').fill('abc');
    await whatsapp.getByLabel('WABA ID').fill(digitos());
    await whatsapp.getByLabel('Número que ven los clientes').fill('300 111 2222');
    await whatsapp.getByLabel('Token de acceso', { exact: true }).fill(token);
    await whatsapp.getByRole('button', { name: 'Conectar número' }).click();
    await expect(alerta(page)).toContainText('son los números que muestra Meta');

    await whatsapp.getByLabel('Phone number ID').fill(digitos());
    await whatsapp.getByRole('button', { name: 'Conectar número' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Número de WhatsApp conectado.' })).toBeVisible();
    await expect(whatsapp).toContainText('+57 300 111 2222');
    await expect(whatsapp.getByLabel('Token de acceso', { exact: true })).toHaveValue('');
    await page.reload();
    expect(await page.content()).not.toContain(token);

    // Desactivar el número pide confirmación.
    await whatsapp.getByRole('button', { name: 'Desactivar número' }).click();
    await whatsapp.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(whatsapp.getByText('Desactivado', { exact: true })).toBeVisible();
  });

  test('invitar al dueño da un enlace de un solo uso y lo deja pendiente', async ({ page }) => {
    await abrirNegocio(page, nombre);
    const usuarios = seccion(page, 'Usuarios');
    await expect(usuarios).toContainText('Nadie entra todavía.');
    await usuarios.getByLabel('Nombre del dueño').fill('Dueño Nuevo');
    await usuarios.getByLabel('Correo del dueño').fill(`dueno-nuevo-${Date.now()}@e2e.turnoo.test`);
    await usuarios.getByRole('button', { name: 'Crear enlace de invitación' }).click();
    await expect(usuarios.getByLabel('Enlace listo. Envíaselo solo a esa persona.')).toHaveValue(/\/aceptar-invitacion#token=/);
    await page.reload();
    await expect(usuarios.getByRole('list', { name: 'Usuarios del negocio' })).toContainText('Invitación pendiente');
  });

  test('suspender va en la zona de peligro y pide escribir el nombre; después se puede activar', async ({ page }) => {
    await abrirNegocio(page, nombre);
    const estado = seccion(page, 'Estado');
    await expect(estado.getByRole('button', { name: /Suspender/ })).toHaveCount(0);
    const peligro = seccion(page, 'Zona de peligro');
    await peligro.getByRole('button', { name: 'Suspender negocio' }).click();
    await expect(peligro.getByText(`¿Suspender ${nombre}?`)).toBeVisible();
    const campo = peligro.getByLabel(`Para confirmar, escribe ${nombre}`);
    await expect(campo).toBeFocused();
    const boton = peligro.getByRole('button', { name: 'Suspender', exact: true });
    await expect(boton).toBeDisabled();
    // Casi el nombre (sin tilde, en minúsculas): no alcanza.
    await campo.fill(nombre.toLowerCase().replace('í', 'i'));
    await expect(boton).toBeDisabled();
    await campo.press('Enter');
    // Aunque el formulario se envíe por código (el navegador ignora el botón desactivado), no suspende.
    await campo.evaluate((c) => (c as HTMLInputElement).form!.requestSubmit());
    await page.waitForTimeout(500);
    await expect(page.getByText('Suspendido', { exact: true })).toHaveCount(0);
    // Volver cierra sin suspender y devuelve el foco.
    await peligro.getByRole('button', { name: 'Volver' }).click();
    await expect(peligro.getByRole('button', { name: 'Suspender negocio' })).toBeFocused();

    await peligro.getByRole('button', { name: 'Suspender negocio' }).click();
    await campo.fill(nombre);
    await boton.click();
    await expect(page.getByText('Suspendido', { exact: true })).toBeVisible();
    await expect(seccion(page, 'Zona de peligro')).toHaveCount(0);
    await estado.getByRole('button', { name: 'Activar' }).click();
    await expect(page.getByText('Activo', { exact: true }).first()).toBeVisible();
    await expect(seccion(page, 'Zona de peligro')).toBeVisible();
  });

  test('el correo largo se corta en su fila y completo queda en el title', async ({ page }) => {
    await abrirNegocio(page, nombre);
    const usuarios = page.getByRole('list', { name: 'Usuarios del negocio' });
    const correo = usuarios.locator('p[title*="@"]').first();
    const completo = await correo.getAttribute('title');
    await expect(correo).toHaveText(completo!);
    await expect(correo).toHaveCSS('text-overflow', 'ellipsis');
    // Y no ensancha la página: nada se sale por la derecha.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const caja = (await correo.boundingBox())!;
    expect(caja.x + caja.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // Sin tarjetas dentro de la tarjeta: las filas no llevan borde propio.
    await expect(usuarios.locator('li').first()).toHaveCSS('border-top-width', '0px');
  });


  test('a un dueño que olvidó su contraseña se le da un enlace para poner una nueva', async ({ page }) => {
    await abrirNegocio(page, 'Barbería E2E');
    const dueno = seccion(page, 'Usuarios').getByRole('listitem').filter({ hasText: 'Dueño E2E' });
    await abrirAcciones(dueno);
    await dueno.getByRole('button', { name: 'Enlace para nueva contraseña' }).click();
    await expect(dueno.getByLabel('Enlace listo. Envíaselo solo a esa persona.')).toHaveValue(/\/restablecer-contrasena#token=/);
  });
});
