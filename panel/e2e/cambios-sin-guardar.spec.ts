import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * Aviso al salir con cambios sin guardar (componentes/guardia-de-salida.tsx), sobre Editar
 * cliente: un formulario cualquiera del panel (FormularioConEstado). Ajustes lo prueba aparte
 * (ajustes.spec.ts), con sus secciones.
 */

const dialogo = (page: Page) => page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
const editar = () => `/clientes/${datos().clientes.editable}/editar`;
const ficha = () => `/clientes/${datos().clientes.editable}`;
const notas = (page: Page) => page.getByLabel('Notas');

/** Escribe como una persona (con teclado): Chrome solo avisa al recargar si hubo interacción. */
async function escribirNota(page: Page, texto: string) {
  await notas(page).click();
  await page.keyboard.type(texto);
}

/** Abre Editar cliente desde su ficha: el historial queda dentro del panel (sin recargar). */
async function abrirEditarDesdeLaFicha(page: Page) {
  await page.goto(ficha());
  await page.getByRole('link', { name: 'Editar' }).click();
  await expect(page).toHaveURL(editar());
  await expect(notas(page)).toBeVisible();
}

/** Falla la prueba si aparece un aviso del navegador (beforeunload, alert…) que no se esperaba. */
function sinAvisosDelNavegador(page: Page) {
  const vistos: string[] = [];
  page.on('dialog', (d) => {
    vistos.push(d.type());
    void d.accept();
  });
  return vistos;
}

test.beforeEach(async ({ page }) => {
  await entrarYEsperar(page, datos().dueno);
});

test('enlace con cambios: pregunta; "Seguir editando" conserva lo escrito y "Salir sin guardar" sale', async ({ page }) => {
  await abrirEditarDesdeLaFicha(page);
  await escribirNota(page, 'Prefiere la tarde');
  const volver = page.getByRole('link', { name: 'Cliente', exact: true });

  await volver.click();
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page)).toContainText('Los cambios que hiciste en esta pantalla se pierden.');
  // Empieza en la opción que no pierde nada.
  await expect(page.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(dialogo(page)).toBeHidden();
  await expect(page).toHaveURL(editar());
  await expect(notas(page)).toHaveValue(/Prefiere la tarde$/);
  // El foco vuelve a donde estaba.
  await expect(volver).toBeFocused();

  await volver.click();
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(ficha());
  await expect(dialogo(page)).toBeHidden();
});

test('el diálogo atrapa el foco, Escape es "Seguir editando" y el resto de la página queda inerte', async ({ page }) => {
  await abrirEditarDesdeLaFicha(page);
  await escribirNota(page, 'x');
  await page.getByRole('link', { name: 'Cliente', exact: true }).click();
  const seguir = page.getByRole('button', { name: 'Seguir editando' });
  const salir = page.getByRole('button', { name: 'Salir sin guardar' });
  await expect(seguir).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(salir).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(seguir).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(salir).toBeFocused();
  // Detrás del diálogo no se puede tocar nada.
  await expect(notas(page).click({ timeout: 1_000 })).rejects.toThrow();

  await page.keyboard.press('Escape');
  await expect(dialogo(page)).toBeHidden();
  await expect(page).toHaveURL(editar());
  await expect(page.getByRole('link', { name: 'Cliente', exact: true })).toBeFocused();
});

test('atrás del navegador con cambios: pregunta igual que un enlace', async ({ page }) => {
  await abrirEditarDesdeLaFicha(page);
  await escribirNota(page, 'Vuelve en un mes');

  await page.goBack();
  await expect(dialogo(page)).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page).toHaveURL(editar());
  await expect(notas(page)).toHaveValue(/Vuelve en un mes$/);

  // Se puede volver a preguntar: el centinela vuelve a quedar arriba.
  await page.goBack();
  await expect(dialogo(page)).toBeVisible();
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(ficha());
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('atrás hacia otra página cargada aparte: pregunta y "Salir" sale sin un segundo aviso del navegador', async ({ page }) => {
  const avisos = sinAvisosDelNavegador(page);
  await page.goto(editar());
  await escribirNota(page, 'Algo');
  await page.goBack();
  await expect(dialogo(page)).toBeVisible();
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL('/hoy');
  expect(avisos).toEqual([]);
});

test('recargar con cambios: avisa el navegador; si se cancela, sigue lo escrito', async ({ page }) => {
  await page.goto(editar());
  await escribirNota(page, 'No recargar');
  const tipos: string[] = [];
  page.once('dialog', (d) => {
    tipos.push(d.type());
    void d.dismiss();
  });
  // Al cancelar el aviso, la recarga no termina: se espera poco.
  await page.reload({ timeout: 3_000 }).catch(() => {});
  expect(tipos).toEqual(['beforeunload']);
  await expect(notas(page)).toHaveValue(/No recargar$/);
});

test('sin cambios no pregunta nada: ni enlace, ni atrás, ni recargar; tampoco si se deja como estaba', async ({ page }) => {
  const avisos = sinAvisosDelNavegador(page);
  await abrirEditarDesdeLaFicha(page);
  await page.reload();
  await expect(notas(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(ficha());

  await page.goForward();
  await expect(page).toHaveURL(editar());
  // Escribir y borrar lo escrito: vuelve a no haber cambios.
  await escribirNota(page, 'ab');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.getByRole('link', { name: 'Cliente', exact: true }).click();
  await expect(page).toHaveURL(ficha());
  await expect(dialogo(page)).toHaveCount(0);
  expect(avisos).toEqual([]);
});

test('Ctrl + clic abre aparte: no pregunta y la página se queda con lo escrito', async ({ page, context }) => {
  await abrirEditarDesdeLaFicha(page);
  await escribirNota(page, 'Sigo aquí');
  const nueva = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Cliente', exact: true }).click({ modifiers: ['ControlOrMeta'] });
  await (await nueva).close();
  await expect(dialogo(page)).toBeHidden();
  await expect(page).toHaveURL(editar());
  await expect(notas(page)).toHaveValue(/Sigo aquí$/);
});

test('guardar no pregunta (la pantalla redirige) y después atrás tampoco', async ({ page }) => {
  const avisos = sinAvisosDelNavegador(page);
  await abrirEditarDesdeLaFicha(page);
  const antes = await notas(page).inputValue();
  await escribirNota(page, ' (e2e)');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL(ficha());
  await expect(dialogo(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(editar());
  await expect(dialogo(page)).toHaveCount(0);
  expect(avisos).toEqual([]);

  // Deja la nota como estaba.
  await notas(page).fill(antes);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL(ficha());
});

test('en el iPhone (sin aviso al recargar), lo dice junto al botón mientras hay cambios', async ({ browser }) => {
  const iphone = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    baseURL: 'http://localhost:3101',
    locale: 'es-CO',
  });
  const page = await iphone.newPage();
  await entrarYEsperar(page, datos().dueno);
  await page.goto(editar());
  const nota = page.getByText('En este iPhone, recargar o cerrar la página no avisa: guarda antes de salir.');
  await expect(notas(page)).toBeVisible();
  await expect(nota).toHaveCount(0);
  await escribirNota(page, 'z');
  await expect(nota).toBeVisible();
  await iphone.close();
});
