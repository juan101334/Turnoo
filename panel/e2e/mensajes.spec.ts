import { expect, test, type Page } from '@playwright/test';
import { alerta, datos, entrarYEsperar } from './datos';

/**
 * Conversaciones y base de conocimiento (ver sembrar.ts). El backend de e2e envía a un Meta de
 * prueba: acepta todo menos un texto con "FALLA-META".
 */

const mensajesEnLaBarra = (page: Page) => page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: /^Mensajes/ });
const historial = (page: Page) => page.getByRole('list', { name: 'Historial' });

test.describe.serial('mensajes', () => {
  test('la barra cuenta las que esperan a una persona; "Todas" incluye las del asistente', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await expect(mensajesEnLaBarra(page)).toHaveAccessibleName('Mensajes, 2 pendientes');
    await mensajesEnLaBarra(page).click();

    const derivado = page.getByRole('link', { name: /Cliente Derivado/ });
    await expect(derivado).toContainText('El asistente no tenía esa información');
    await expect(derivado).toContainText('Pregunta si hay parqueadero');
    await expect(page.getByRole('link', { name: /Cliente Antiguo/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cliente Con Asistente/ })).toHaveCount(0);

    await page.getByRole('link', { name: 'Todas' }).click();
    await expect(page).toHaveURL('/mensajes?ver=todas');
    await expect(page.getByRole('link', { name: /Cliente Con Asistente/ })).toContainText('La atiende el asistente');
  });

  test('responder envía por WhatsApp y queda en el historial; si Meta lo rechaza, se marca como no entregado', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/mensajes/${datos().conversaciones.derivada}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Cliente Derivado' })).toBeVisible();
    await expect(historial(page)).toContainText('¿Tienen parqueadero?');
    await expect(page.getByText(/^Hasta hoy a las .+ el asistente no le responde;/)).toBeVisible();

    await page.getByLabel('Mensaje', { exact: true }).fill('Sí, hay parqueadero frente al local.');
    await page.getByRole('button', { name: 'Enviar por WhatsApp' }).click();
    await expect(page.getByText('Mensaje enviado.')).toBeVisible();
    await expect(historial(page).getByRole('listitem').last()).toContainText('Negocio');
    await expect(historial(page).getByRole('listitem').last()).toContainText('Sí, hay parqueadero frente al local.');
    await expect(page.getByLabel('Mensaje', { exact: true })).toHaveValue('');

    await page.getByLabel('Mensaje', { exact: true }).fill('Este FALLA-META');
    await page.getByRole('button', { name: 'Enviar por WhatsApp' }).click();
    await expect(alerta(page)).toContainText('WhatsApp no aceptó el mensaje');
    await expect(historial(page).getByRole('listitem').last()).toContainText('No se entregó');
  });

  test('pasadas 24 h desde el último mensaje del cliente no se ofrece responder', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/mensajes/${datos().conversaciones.vieja}`);
    await expect(page.getByText(/Pasaron más de 24 horas/)).toBeVisible();
    await expect(page.getByLabel('Mensaje', { exact: true })).toHaveCount(0);
  });

  test('responder en una conversación del asistente la pasa al negocio', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/mensajes/${datos().conversaciones.conIa}`);
    await expect(page.getByText(/La atiende el asistente\. Si le escribes/)).toBeVisible();
    await page.getByLabel('Mensaje', { exact: true }).fill('Hola, te escribe el dueño.');
    await page.getByRole('button', { name: 'Enviar por WhatsApp' }).click();
    await expect(page.getByText('Mensaje enviado.')).toBeVisible();
    await expect(page.getByText(/el asistente no le responde;/)).toBeVisible();
    await expect(mensajesEnLaBarra(page)).toHaveAccessibleName('Mensajes, 3 pendientes');
  });

  test('el barbero no entra a mensajes ni a la base de conocimiento', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    for (const ruta of [`/mensajes/${datos().conversaciones.derivada}`, '/conocimiento']) {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'Esta página no existe' }), ruta).toBeVisible();
    }
  });
});

test.describe.serial('base de conocimiento', () => {
  const pregunta = '¿Reciben pagos con Nequi?';

  test('agregar una pregunta; repetirla muestra el error del backend', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/conocimiento');
    await expect(page.getByText('Todavía no hay preguntas.')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    const agregar = async () => {
      await page.getByLabel('Pregunta', { exact: true }).fill(pregunta);
      await page.getByLabel('Respuesta', { exact: true }).fill('Sí, Nequi y Daviplata.');
      await page.getByRole('button', { name: 'Agregar pregunta' }).click();
    };
    await agregar();
    await expect(page.getByText('Pregunta agregada. El asistente ya la usa.')).toBeVisible();
    await agregar();
    await expect(alerta(page)).toContainText('Ya hay una entrada con esa pregunta');
    await expect(page.getByRole('listitem').filter({ hasText: pregunta })).toHaveCount(1);
    await expect(page.getByText('1 de 200 preguntas · 1%')).toBeVisible();
  });

  test('pausar, editar y borrar con confirmación', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/conocimiento');
    const entrada = page.getByRole('listitem').filter({ hasText: pregunta });

    await entrada.getByRole('button', { name: 'Pausar' }).click();
    await expect(entrada).toContainText('Pausada: el asistente no la usa');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    await entrada.getByRole('link', { name: `Editar: ${pregunta}` }).click();
    await expect(page.getByLabel('El asistente la usa')).not.toBeChecked();
    await page.getByLabel('Respuesta', { exact: true }).fill('Sí: Nequi, Daviplata y efectivo.');
    await page.getByLabel('El asistente la usa').check();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL('/conocimiento');
    await expect(entrada).toContainText('Sí: Nequi, Daviplata y efectivo.');
    await expect(entrada).not.toContainText('Pausada');

    await entrada.getByRole('button', { name: 'Borrar' }).click();
    await expect(entrada.getByText('¿Borrar esta pregunta?')).toBeVisible();
    await entrada.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByText('Todavía no hay preguntas.')).toBeVisible();
  });
});
